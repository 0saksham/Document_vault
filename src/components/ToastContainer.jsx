import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export default function ToastContainer({ toasts }) {
  return (
    <div
      className="toast-container"
      aria-live="polite"
      aria-atomic="false"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <span className="toast-icon" aria-hidden>{toast.icon}</span>
            {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
