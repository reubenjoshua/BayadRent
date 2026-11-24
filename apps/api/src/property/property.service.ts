import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { UserRole } from '@bayadrent/shared-types';
import * as bcrypt from 'bcrypt';
import { and, asc, desc, eq } from 'drizzle-orm';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { AuditService } from '../audit/audit.service';
import { DATABASE } from '../db/db.constants';
import type { Database } from '../db';
import { leases, properties, propertyUtilityTypes, units, users } from '../db/schema';
import { GCASH_QR_DIR } from '../payment/payment-storage';
import { ObjectStorageService } from '../storage/object-storage.service';
import {
  isS3Path,
  persistUploadedFile,
  s3KeyFromPath,
} from '../storage/upload-persist';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { CreatePropertyDto } from './dto/create-property.dto';
import { CreateUnitDto } from './dto/create-unit.dto';
import { CreateUtilityTypeDto } from './dto/create-utility-type.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { UpdatePropertyGcashDto } from './dto/update-property-gcash.dto';
import { UpdateUtilityTypeDto } from './dto/update-utility-type.dto';

@Injectable()
export class PropertyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly storage: ObjectStorageService,
  ) {}

  async createProperty(landlordId: string, dto: CreatePropertyDto) {
    const [property] = await this.db
      .insert(properties)
      .values({
        landlordId,
        name: dto.name.trim(),
        address: dto.address.trim(),
      })
      .returning();

    return { ...property, units: [] as never[] };
  }

  async listPropertiesForLandlord(landlordId: string) {
    const rows = await this.db.query.properties.findMany({
      where: eq(properties.landlordId, landlordId),
      orderBy: [desc(properties.createdAt)],
      with: {
        utilityTypes: {
          orderBy: [asc(propertyUtilityTypes.sortOrder), asc(propertyUtilityTypes.createdAt)],
        },
        units: {
          with: {
            leases: {
              orderBy: [desc(leases.createdAt)],
              with: {
                renter: {
                  columns: {
                    id: true,
                    email: true,
                    fullName: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return rows.map((property) => ({
      id: property.id,
      landlordId: property.landlordId,
      name: property.name,
      address: property.address,
      gcashAccountName: property.gcashAccountName,
      gcashMobileNumber: property.gcashMobileNumber,
      hasGcashQr: Boolean(property.gcashQrPath),
      utilityTypes: property.utilityTypes.map((u) => ({
        id: u.id,
        name: u.name,
        unitLabel: u.unitLabel,
        unitRate: Number(u.unitRate),
        sortOrder: u.sortOrder,
        active: u.active,
      })),
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
      units: property.units.map((unit) => {
        const active = unit.leases.find((l) => l.status === 'ACTIVE') ?? null;
        const history = unit.leases
          .filter((l) => l.status === 'ENDED')
          .slice(0, 8)
          .map((l) => ({
            id: l.id,
            rentAmount: l.rentAmount,
            dueDay: l.dueDay,
            startDate: l.startDate,
            endDate: l.endDate,
            status: l.status,
            renter: l.renter,
          }));
        return {
          id: unit.id,
          propertyId: unit.propertyId,
          label: unit.label,
          createdAt: unit.createdAt,
          updatedAt: unit.updatedAt,
          activeLease: active
            ? {
                id: active.id,
                rentAmount: active.rentAmount,
                dueDay: active.dueDay,
                startDate: active.startDate,
                status: active.status,
                renter: active.renter,
              }
            : null,
          leaseHistory: history,
        };
      }),
    }));
  }

  async createUnit(landlordId: string, propertyId: string, dto: CreateUnitDto) {
    await this.requireOwnedProperty(landlordId, propertyId);

    const [unit] = await this.db
      .insert(units)
      .values({
        propertyId,
        label: dto.label.trim(),
      })
      .returning();

    return { ...unit, activeLease: null };
  }

  async createLease(landlordId: string, unitId: string, dto: CreateLeaseDto) {
    const unit = await this.db.query.units.findFirst({
      where: eq(units.id, unitId),
      with: {
        property: true,
      },
    });

    if (!unit || unit.property.landlordId !== landlordId) {
      throw new NotFoundException('Unit not found');
    }

    const existingActive = await this.db.query.leases.findFirst({
      where: and(eq(leases.unitId, unitId), eq(leases.status, 'ACTIVE')),
    });

    if (existingActive) {
      throw new ConflictException('Unit already has an active lease');
    }

    const renter = await this.db.query.users.findFirst({
      where: eq(users.email, dto.renterEmail.toLowerCase()),
    });

    if (!renter || renter.role !== UserRole.RENTER) {
      throw new BadRequestException(
        'Renter not found. The email must belong to a registered RENTER account.',
      );
    }

    const startDate = dto.startDate ?? new Date().toISOString().slice(0, 10);

    const [lease] = await this.db
      .insert(leases)
      .values({
        unitId,
        renterId: renter.id,
        rentAmount: dto.rentAmount,
        dueDay: dto.dueDay,
        startDate,
        status: 'ACTIVE',
      })
      .returning();

    await this.audit.log({
      actorId: landlordId,
      action: 'LEASE_CREATED',
      entityType: 'lease',
      entityId: lease.id,
      summary: `Assigned ${renter.fullName} to ${unit.property.name} · ${unit.label}`,
    });

    return {
      ...lease,
      renter: {
        id: renter.id,
        email: renter.email,
        fullName: renter.fullName,
      },
      unit: {
        id: unit.id,
        label: unit.label,
      },
      property: {
        id: unit.property.id,
        name: unit.property.name,
        address: unit.property.address,
      },
    };
  }

  async updateLease(landlordId: string, leaseId: string, dto: UpdateLeaseDto) {
    if (dto.rentAmount === undefined && dto.dueDay === undefined) {
      throw new BadRequestException('Provide rentAmount and/or dueDay to update');
    }

    const lease = await this.db.query.leases.findFirst({
      where: eq(leases.id, leaseId),
      with: {
        renter: { columns: { id: true, email: true, fullName: true } },
        unit: { with: { property: true } },
      },
    });

    if (!lease || lease.unit.property.landlordId !== landlordId) {
      throw new NotFoundException('Lease not found');
    }
    if (lease.status !== 'ACTIVE') {
      throw new BadRequestException('Only active leases can be amended');
    }

    const [updated] = await this.db
      .update(leases)
      .set({
        rentAmount: dto.rentAmount ?? lease.rentAmount,
        dueDay: dto.dueDay ?? lease.dueDay,
        updatedAt: new Date(),
      })
      .where(eq(leases.id, leaseId))
      .returning();

    await this.audit.log({
      actorId: landlordId,
      action: 'LEASE_AMENDED',
      entityType: 'lease',
      entityId: leaseId,
      summary: `Amended lease for ${lease.renter.fullName} on ${lease.unit.property.name} · ${lease.unit.label} (rent ${updated.rentAmount}, due day ${updated.dueDay})`,
    });

    return {
      ...updated,
      renter: lease.renter,
      unit: { id: lease.unit.id, label: lease.unit.label },
      property: {
        id: lease.unit.property.id,
        name: lease.unit.property.name,
        address: lease.unit.property.address,
      },
    };
  }

  async endLease(landlordId: string, unitId: string) {
    const unit = await this.db.query.units.findFirst({
      where: eq(units.id, unitId),
      with: {
        property: true,
      },
    });

    if (!unit || unit.property.landlordId !== landlordId) {
      throw new NotFoundException('Unit not found');
    }

    const activeLease = await this.db.query.leases.findFirst({
      where: and(eq(leases.unitId, unitId), eq(leases.status, 'ACTIVE')),
      with: {
        renter: {
          columns: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });

    if (!activeLease) {
      throw new ConflictException('Unit has no active lease to end');
    }

    const endDate = new Date().toISOString().slice(0, 10);
    const [ended] = await this.db
      .update(leases)
      .set({
        status: 'ENDED',
        endDate,
        updatedAt: new Date(),
      })
      .where(eq(leases.id, activeLease.id))
      .returning();

    await this.audit.log({
      actorId: landlordId,
      action: 'LEASE_ENDED',
      entityType: 'lease',
      entityId: ended.id,
      summary: `Ended lease for ${activeLease.renter.fullName} on ${unit.property.name} · ${unit.label}`,
    });

    return {
      ...ended,
      renter: activeLease.renter,
      unit: {
        id: unit.id,
        label: unit.label,
      },
      property: {
        id: unit.property.id,
        name: unit.property.name,
        address: unit.property.address,
      },
    };
  }

  async seedDemo(landlordId: string) {
    const existing = await this.db.query.properties.findFirst({
      where: and(eq(properties.landlordId, landlordId), eq(properties.name, 'Demo Residences')),
    });
    if (existing) {
      throw new ConflictException('Demo Residences already exists on your account');
    }

    const demoEmail = `demo.renter.${landlordId.slice(0, 8)}@bayadrent.local`;
    let renter = await this.db.query.users.findFirst({
      where: eq(users.email, demoEmail),
    });
    if (!renter) {
      const passwordHash = await bcrypt.hash('DemoRenter123!', 10);
      const [created] = await this.db
        .insert(users)
        .values({
          email: demoEmail,
          passwordHash,
          fullName: 'Demo Renter',
          role: UserRole.RENTER,
        })
        .returning();
      renter = created;
    }

    const [property] = await this.db
      .insert(properties)
      .values({
        landlordId,
        name: 'Demo Residences',
        address: '100 Sample Street, Makati',
      })
      .returning();

    const [unitA] = await this.db
      .insert(units)
      .values({ propertyId: property.id, label: 'Studio' })
      .returning();
    await this.db.insert(units).values({ propertyId: property.id, label: '2A' });

    const startDate = new Date().toISOString().slice(0, 10);
    const [lease] = await this.db
      .insert(leases)
      .values({
        unitId: unitA.id,
        renterId: renter.id,
        rentAmount: 15000,
        dueDay: 5,
        startDate,
        status: 'ACTIVE',
      })
      .returning();

    await this.audit.log({
      actorId: landlordId,
      action: 'DEMO_SEEDED',
      entityType: 'property',
      entityId: property.id,
      summary: `Seeded Demo Residences with Studio leased to ${renter.fullName} (${demoEmail} / DemoRenter123!)`,
    });

    return {
      property,
      demoRenter: { email: demoEmail, password: 'DemoRenter123!', fullName: renter.fullName },
      leaseId: lease.id,
      message:
        'Demo Residences created with Studio leased and vacant 2A. Generate invoices to populate the tracker.',
    };
  }

  async listLeasesForRenter(renterId: string) {
    const rows = await this.db.query.leases.findMany({
      where: and(eq(leases.renterId, renterId), eq(leases.status, 'ACTIVE')),
      orderBy: [desc(leases.createdAt)],
      with: {
        unit: {
          with: {
            property: {
              columns: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
      },
    });

    return rows.map((lease) => ({
      id: lease.id,
      rentAmount: lease.rentAmount,
      dueDay: lease.dueDay,
      startDate: lease.startDate,
      status: lease.status,
      unit: {
        id: lease.unit.id,
        label: lease.unit.label,
      },
      property: lease.unit.property,
    }));
  }

  async updateGcash(
    landlordId: string,
    propertyId: string,
    dto: UpdatePropertyGcashDto,
    file?: Express.Multer.File,
  ) {
    const property = await this.requireOwnedProperty(landlordId, propertyId);

    let gcashQrPath = property.gcashQrPath;
    if (file) {
      gcashQrPath = await persistUploadedFile(this.storage, file, 'gcash-qr');
    }

    const [updated] = await this.db
      .update(properties)
      .set({
        gcashAccountName:
          dto.gcashAccountName !== undefined
            ? dto.gcashAccountName.trim() || null
            : property.gcashAccountName,
        gcashMobileNumber:
          dto.gcashMobileNumber !== undefined
            ? dto.gcashMobileNumber.trim() || null
            : property.gcashMobileNumber,
        gcashQrPath,
        gcashQrOriginalName: file ? file.originalname : property.gcashQrOriginalName,
        gcashQrMimeType: file ? file.mimetype : property.gcashQrMimeType,
        updatedAt: new Date(),
      })
      .where(eq(properties.id, propertyId))
      .returning();

    await this.audit.log({
      actorId: landlordId,
      action: 'PROPERTY_GCASH_UPDATED',
      entityType: 'property',
      entityId: propertyId,
      summary: `Updated GCash details for ${updated.name}`,
    });

    return {
      id: updated.id,
      name: updated.name,
      gcashAccountName: updated.gcashAccountName,
      gcashMobileNumber: updated.gcashMobileNumber,
      hasGcashQr: Boolean(updated.gcashQrPath),
    };
  }

  async getGcashQrFile(
    viewer: { id: string; role: string },
    propertyId: string,
  ): Promise<{ file: StreamableFile; mimeType: string; filename: string }> {
    const property = await this.db.query.properties.findFirst({
      where: eq(properties.id, propertyId),
      with: {
        units: {
          with: {
            leases: {
              where: eq(leases.status, 'ACTIVE'),
              columns: { renterId: true },
            },
          },
        },
      },
    });

    if (!property || !property.gcashQrPath) {
      throw new NotFoundException('GCash QR not found');
    }

    const isLandlord = property.landlordId === viewer.id;
    const isRenter =
      viewer.role === UserRole.RENTER &&
      property.units.some((unit) => unit.leases.some((lease) => lease.renterId === viewer.id));

    if (!isLandlord && !isRenter) {
      throw new ForbiddenException('You cannot view this GCash QR');
    }

    if (isS3Path(property.gcashQrPath)) {
      try {
        const { stream, contentType } = await this.storage.getObjectStream(
          s3KeyFromPath(property.gcashQrPath),
        );
        return {
          file: new StreamableFile(stream),
          mimeType: property.gcashQrMimeType ?? contentType ?? 'image/png',
          filename: property.gcashQrOriginalName ?? s3KeyFromPath(property.gcashQrPath),
        };
      } catch {
        throw new NotFoundException('GCash QR file missing on storage');
      }
    }

    const fullPath = join(GCASH_QR_DIR, property.gcashQrPath);
    if (!existsSync(fullPath)) {
      throw new NotFoundException('GCash QR file missing on server');
    }

    return {
      file: new StreamableFile(createReadStream(fullPath)),
      mimeType: property.gcashQrMimeType ?? 'image/png',
      filename: property.gcashQrOriginalName ?? property.gcashQrPath,
    };
  }

  async listUtilityTypes(landlordId: string, propertyId: string) {
    await this.requireOwnedProperty(landlordId, propertyId);
    const rows = await this.db.query.propertyUtilityTypes.findMany({
      where: eq(propertyUtilityTypes.propertyId, propertyId),
      orderBy: [asc(propertyUtilityTypes.sortOrder), asc(propertyUtilityTypes.createdAt)],
    });
    return rows.map((row) => this.mapUtilityType(row));
  }

  async createUtilityType(landlordId: string, propertyId: string, dto: CreateUtilityTypeDto) {
    await this.requireOwnedProperty(landlordId, propertyId);
    const [row] = await this.db
      .insert(propertyUtilityTypes)
      .values({
        propertyId,
        name: dto.name.trim(),
        unitLabel: (dto.unitLabel ?? 'unit').trim() || 'unit',
        unitRate: String(dto.unitRate ?? 0),
        sortOrder: dto.sortOrder ?? 0,
        active: true,
      })
      .returning();
    await this.audit.log({
      actorId: landlordId,
      action: 'UTILITY_TYPE_CREATED',
      entityType: 'property_utility_type',
      entityId: row.id,
      summary: `Added utility “${row.name}” @ ₱${row.unitRate}/${row.unitLabel}`,
    });
    return this.mapUtilityType(row);
  }

  async updateUtilityType(landlordId: string, utilityTypeId: string, dto: UpdateUtilityTypeDto) {
    const existing = await this.db.query.propertyUtilityTypes.findFirst({
      where: eq(propertyUtilityTypes.id, utilityTypeId),
      with: { property: true },
    });
    if (!existing || existing.property.landlordId !== landlordId) {
      throw new NotFoundException('Utility type not found');
    }

    const [row] = await this.db
      .update(propertyUtilityTypes)
      .set({
        name: dto.name !== undefined ? dto.name.trim() : existing.name,
        unitLabel:
          dto.unitLabel !== undefined
            ? dto.unitLabel.trim() || existing.unitLabel
            : existing.unitLabel,
        unitRate: dto.unitRate !== undefined ? String(dto.unitRate) : existing.unitRate,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        active: dto.active ?? existing.active,
        updatedAt: new Date(),
      })
      .where(eq(propertyUtilityTypes.id, utilityTypeId))
      .returning();

    return this.mapUtilityType(row);
  }

  private mapUtilityType(row: typeof propertyUtilityTypes.$inferSelect) {
    return {
      id: row.id,
      propertyId: row.propertyId,
      name: row.name,
      unitLabel: row.unitLabel,
      unitRate: Number(row.unitRate),
      sortOrder: row.sortOrder,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async deleteUtilityType(landlordId: string, utilityTypeId: string) {
    const existing = await this.db.query.propertyUtilityTypes.findFirst({
      where: eq(propertyUtilityTypes.id, utilityTypeId),
      with: { property: true },
    });
    if (!existing || existing.property.landlordId !== landlordId) {
      throw new NotFoundException('Utility type not found');
    }

    await this.db
      .update(propertyUtilityTypes)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(propertyUtilityTypes.id, utilityTypeId));

    return { ok: true };
  }

  private async requireOwnedProperty(landlordId: string, propertyId: string) {
    const property = await this.db.query.properties.findFirst({
      where: and(eq(properties.id, propertyId), eq(properties.landlordId, landlordId)),
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }
}
