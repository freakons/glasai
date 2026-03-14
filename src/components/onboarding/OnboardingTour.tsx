'use client';

import { useState } from 'react';
import { useOnboarding } from '@/hooks/useOnboarding';

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Intelligence Feed',
    description:
      'Your real-time stream of verified AI signals — model launches, funding rounds, regulation changes, and more. Everything is sourced, structured, and ranked by significance so you see what matters first.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="tour-step-icon">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    title: 'Signal Intelligence Indicators',
    description:
      'Each signal carries impact, momentum, confidence, and corroboration scores. Impact tells you how significant an event is. Momentum shows if attention is rising or falling. Confidence and corroboration reflect how well-sourced the signal is.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="tour-step-icon">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    title: 'Entity Dossiers',
    description:
      'Dive deep into any company or organization. Dossiers aggregate every signal, funding event, and regulatory action tied to an entity — giving you a full timeline and strategic profile in one place.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="tour-step-icon">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    title: 'Watchlist',
    description:
      'Track the entities that matter to you. Add companies, regulators, or research labs to your watchlist and get a personalized feed of their latest signals and activity — all saved locally in your browser.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="tour-step-icon">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    title: 'Ecosystem Activity',
    description:
      'See the big picture at a glance. The ecosystem overview surfaces the most active entities, trending categories, recent funding, and model releases — so you always know what is moving in the AI landscape.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="tour-step-icon">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
  },
];

type TourPhase = 'welcome' | 'touring' | 'hidden';

export function OnboardingTour() {
  const { completed, markCompleted, reset } = useOnboarding();
  const [phase, setPhase] = useState<TourPhase>(completed ? 'hidden' : 'welcome');
  const [step, setStep] = useState(0);

  // Called from sidebar "Start tour" link
  // We expose this via a global so the sidebar can trigger it
  if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__omStartTour = () => {
      reset();
      setStep(0);
      setPhase('welcome');
    };
  }

  if (phase === 'hidden') return null;

  const handleSkip = () => {
    markCompleted();
    setPhase('hidden');
  };

  const handleStartTour = () => {
    setPhase('touring');
    setStep(0);
  };

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      markCompleted();
      setPhase('hidden');
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  // Welcome dialog
  if (phase === 'welcome') {
    return (
      <div className="tour-overlay" role="dialog" aria-label="Welcome to Omterminal">
        <div className="tour-dialog tour-welcome">
          <div className="tour-welcome-icon">
            <svg viewBox="0 0 32 32" width="48" height="48">
              <defs>
                <linearGradient id="tour-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4f46e5" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="7" fill="url(#tour-grad)" />
              <text y="22" x="5" fontSize="14" fontFamily="Georgia,serif" fill="white" fontWeight="900">Om</text>
            </svg>
          </div>
          <h2 className="tour-welcome-title">Welcome to Omterminal</h2>
          <p className="tour-welcome-desc">
            Track signals, trends, and strategic activity across the AI ecosystem.
          </p>
          <div className="tour-welcome-actions">
            <button className="tour-btn tour-btn-primary" onClick={handleStartTour}>
              Start quick tour
            </button>
            <button className="tour-btn tour-btn-secondary" onClick={handleSkip}>
              Skip
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tour step
  const current = TOUR_STEPS[step];

  return (
    <div className="tour-overlay" role="dialog" aria-label={`Tour step ${step + 1} of ${TOUR_STEPS.length}`}>
      <div className="tour-dialog tour-step-dialog">
        <div className="tour-step-header">
          <div className="tour-step-icon-wrap">{current.icon}</div>
          <div className="tour-step-progress">Step {step + 1} of {TOUR_STEPS.length}</div>
        </div>
        <h3 className="tour-step-title">{current.title}</h3>
        <p className="tour-step-desc">{current.description}</p>

        <div className="tour-step-dots">
          {TOUR_STEPS.map((_, i) => (
            <div key={i} className={`tour-dot${i === step ? ' tour-dot-active' : ''}`} />
          ))}
        </div>

        <div className="tour-step-actions">
          <button
            className="tour-btn tour-btn-secondary"
            onClick={handleSkip}
          >
            Skip tour
          </button>
          <div className="tour-step-nav">
            {step > 0 && (
              <button className="tour-btn tour-btn-ghost" onClick={handleBack}>
                Back
              </button>
            )}
            <button className="tour-btn tour-btn-primary" onClick={handleNext}>
              {step < TOUR_STEPS.length - 1 ? 'Next' : 'Finish'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
