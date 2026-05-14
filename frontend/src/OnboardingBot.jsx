import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './OnboardingBot.css';

const STEPS = [
  {
    page: '/',
    selector: '.tools-grid',
    title: 'Welcome to AMLI Tools',
    description: 'Choose a tool to get started. Cipher Tool for encryption, Artifacts for SOA documentation, or Library to browse history.',
    position: 'bottom'
  },
  {
    page: '/cipher',
    selector: '.mode-toggle',
    title: 'Choose Encryption Mode',
    description: 'Toggle between AES/GCM (recommended, authenticated encryption) or AES/CBC mode.',
    position: 'bottom'
  },
  {
    page: '/cipher',
    selector: '.workspace-column',
    title: 'Encrypt & Decrypt',
    description: 'Paste your message and key, then click Encrypt or Decrypt. Output appears in the right panel.',
    position: 'top'
  },
  {
    page: '/artifacts',
    selector: '.artifact-group-card',
    title: 'Create Artifacts',
    description: 'Fill in Jira ticket, API name, curl command, and response. Enable encryption if needed. Generate downloadable ZIP archives.',
    position: 'top'
  },
  {
    page: '/library',
    selector: '.api-table',
    title: 'Browse Library',
    description: 'Search past artifacts, copy curl commands, or re-download ZIPs. Use the compare tool to spot differences.',
    position: 'top'
  }
];

export default function OnboardingBot() {
  const [active, setActive] = useState(() => !localStorage.getItem('onboarding_done'));
  const [stepIndex, setStepIndex] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIndex];
    if (!step) return;
    if (location.pathname !== step.page) return;

    const timer = setTimeout(() => {
      const el = document.querySelector(step.selector);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
    return () => clearTimeout(timer);
  }, [active, stepIndex, location.pathname]);

  const goNext = () => {
    if (stepIndex < STEPS.length - 1) {
      const nextStep = STEPS[stepIndex + 1];
      setStepIndex(stepIndex + 1);
      if (nextStep.page !== location.pathname) {
        navigate(nextStep.page);
      }
    } else {
      finish();
    }
  };

  const goPrev = () => {
    if (stepIndex > 0) {
      const prevStep = STEPS[stepIndex - 1];
      setStepIndex(stepIndex - 1);
      if (prevStep.page !== location.pathname) {
        navigate(prevStep.page);
      }
    }
  };

  const finish = () => {
    setActive(false);
    localStorage.setItem('onboarding_done', 'true');
  };

  const step = STEPS[stepIndex];
  if (!active || !step) return null;
  if (step.page !== location.pathname) return null;

  return (
    <>
      <div className="onboarding-overlay" onClick={finish} />
      <div className={`onboarding-tooltip onboarding-tooltip--${step.position}`}>
        <div className="onboarding-tooltip__step-indicator">
          Step {stepIndex + 1} of {STEPS.length}
        </div>
        <h3 className="onboarding-tooltip__title">{step.title}</h3>
        <p className="onboarding-tooltip__description">{step.description}</p>
        <div className="onboarding-tooltip__actions">
          <button className="onboarding-tooltip__skip" onClick={finish}>
            Skip All
          </button>
          <div>
            {stepIndex > 0 && (
              <button className="onboarding-tooltip__prev" onClick={goPrev}>
                ← Back
              </button>
            )}
            <button className="onboarding-tooltip__next" onClick={goNext}>
              {stepIndex === STEPS.length - 1 ? 'Done' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
