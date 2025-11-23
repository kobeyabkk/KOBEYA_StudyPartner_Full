/**
 * Toast Notification Component
 * 
 * Simple, accessible toast notifications for user feedback
 * - Success, error, info, warning types
 * - Auto-dismiss after configurable duration
 * - Manual dismiss with X button
 * - Accessible with ARIA labels
 * - Animated entrance/exit with Framer Motion
 */

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // milliseconds, 0 = no auto-dismiss
  onClose: (id: string) => void;
}

const TOAST_ICONS = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
  warning: '⚠️'
};

const TOAST_COLORS = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800'
};

export const Toast: React.FC<ToastProps> = ({
  id,
  type,
  message,
  duration = 3000,
  onClose
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [id, duration, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 shadow-lg ${TOAST_COLORS[type]} min-w-[300px] max-w-[500px]`}
      role="alert"
      aria-live="polite"
    >
      <span className="text-2xl flex-shrink-0" aria-hidden="true">
        {TOAST_ICONS[type]}
      </span>
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Close notification"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
};

// Toast Container Component
export interface ToastContainerProps {
  toasts: ToastProps[];
  onClose: (id: string) => void;
  position?: 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';
}

const POSITION_CLASSES = {
  'top-right': 'top-4 right-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  'bottom-left': 'bottom-4 left-4'
};

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onClose,
  position = 'top-right'
}) => {
  return (
    <div
      className={`fixed z-50 flex flex-col gap-2 ${POSITION_CLASSES[position]}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={onClose} />
        ))}
      </AnimatePresence>
    </div>
  );
};

// Custom Hook for Toast Management
export interface ToastOptions {
  type?: ToastType;
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastProps[]>([]);

  const showToast = React.useCallback((message: string, options: ToastOptions = {}) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: ToastProps = {
      id,
      type: options.type || 'info',
      message,
      duration: options.duration ?? 3000,
      onClose: (toastId) => {
        setToasts((prev) => prev.filter((t) => t.id !== toastId));
      }
    };
    
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const success = React.useCallback((message: string, duration?: number) => {
    return showToast(message, { type: 'success', duration });
  }, [showToast]);

  const error = React.useCallback((message: string, duration?: number) => {
    return showToast(message, { type: 'error', duration });
  }, [showToast]);

  const info = React.useCallback((message: string, duration?: number) => {
    return showToast(message, { type: 'info', duration });
  }, [showToast]);

  const warning = React.useCallback((message: string, duration?: number) => {
    return showToast(message, { type: 'warning', duration });
  }, [showToast]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = React.useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    showToast,
    success,
    error,
    info,
    warning,
    dismiss,
    dismissAll
  };
}

export default Toast;
