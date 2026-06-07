import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Tag, CheckSquare, Keyboard, ArrowRight, X } from 'lucide-react';

const STORAGE_KEY = 'todoflow-onboarding-done';

const steps = [
  {
    icon: <Tag size={32} />,
    title: '创建你的第一个标签',
    description: '标签可以帮助你按项目或分类管理任务。点击侧边栏右侧的 + 按钮开始吧。',
    color: 'from-indigo-500 to-blue-500',
  },
  {
    icon: <CheckSquare size={32} />,
    title: '添加你的第一个任务',
    description: '使用底部的快速添加栏输入任务，按 Enter 创建，点击任务可打开详情面板。',
    color: 'from-[#7C72F6] to-[#A78BFA]',
  },
  {
    icon: <Keyboard size={32} />,
    title: '掌握快捷键',
    description: '按 ? 查看所有快捷键。Ctrl+K 打开命令面板，Ctrl+B 折叠侧边栏，Ctrl+Shift+T 全局快速添加。',
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
              跳过
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
                  下一步
                  <ArrowRight size={16} />
                </>
              ) : (
                '开始使用'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
