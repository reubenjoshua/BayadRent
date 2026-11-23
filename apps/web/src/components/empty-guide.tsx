type GuideStep = {
  title: string;
  body: string;
  done?: boolean;
  current?: boolean;
};

type EmptyGuideProps = {
  title: string;
  intro: string;
  steps: GuideStep[];
};

export function EmptyGuide({ title, intro, steps }: EmptyGuideProps) {
  return (
    <div className="guide">
      <p className="eyebrow">Getting started</p>
      <h3 className="guide-title">{title}</h3>
      <p className="guide-intro">{intro}</p>
      <ol className="guide-steps">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className={`guide-step ${step.done ? 'is-done' : ''} ${step.current ? 'is-current' : ''}`}
          >
            <span className="guide-index mono">{index + 1}</span>
            <div>
              <p className="guide-step-title">{step.title}</p>
              <p className="guide-step-body">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
