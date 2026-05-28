import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tag, CheckSquare, Keyboard, ArrowRight, X } from 'lucide-react';

const STORAGE_KEY = 'todoflow-onboarding-done';

const steps = [
  {
    icon: <Tag size={32} />,
    title: 'Create your first tag',
    description: 'Tags help you organize tasks by project or category. Click the + button in the sidebar to get started.',
    color: 'from-indigo-500 to-blue-500',
  },
  {
    icon: <CheckSquare size={32} />,
    title: 'Add your first task',
    description: 'Use the quick-add bar at the bottom of any page. Press Enter to create, or click a task to open its details.',
    color: 'from-[#7C72F6] to-[#A78BFA]',
  },
  {
    icon: <Keyboard size={32} />,
    title: 'Master keyboard shortcuts',
    description: 'Press ? for all shortcuts. Ctrl+K opens the command palette. Ctrl+B toggles the sidebar. Long-press a task to select multiple.',
    color: 'from-amber-500 to-orange-500',
  },
];

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY));
  const [step, setStep] = useState(0);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, '1');
  };

  if (!visible) return null;

  const current = steps[step];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center"
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="bg-white dark:bg-[#1e1e32] rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center"
        >
          {/* Accent bar */}
          <div className={`h-1 rounded-full bg-gradient-to-r ${current.color} mb-6`} />

          {/* Step indicator */}
          <div className="flex justify-center gap-1.5 mb-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? 'bg-[#7C72F6]' : 'bg-[#F3F4F6] dark:bg-white/[0.06]'
                }`}
              />
            ))}
          </div>

          {/* Icon */}
          <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${current.color} text-white mb-4`}>
            {current.icon}
          </div>

          {/* Content */}
          <h2 className="text-xl font-bold mb-2">{current.title}</h2>
          <p className="text-sm text-[#6B7280] mb-8 leading-relaxed">
            {current.description}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={dismiss}
              className="text-xs text-[#6B7280] hover:text-[#111827] dark:hover:text-white/90 transition-colors flex items-center gap-1"
            >
              <X size={14} />
              Skip all
            </button>

            <button
              onClick={() => {
                if (step < steps.length - 1) {
                  setStep(step + 1);
                } else {
                  dismiss();
                }
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7C72F6] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {step < steps.length - 1 ? (
                <>
                  Next
                  <ArrowRight size={16} />
                </>
              ) : (
                'Get started'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
