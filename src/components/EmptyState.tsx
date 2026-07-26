import React from 'react';
import styles from './EmptyState.module.css';

/**
 * EmptyState component props
 */
export interface EmptyStateProps {
  /** Title text displayed prominently */
  title: string;
  /** Description text providing context */
  description: string;
  /** URL or path to the illustration image */
  illustrationUrl: string;
  /** Array of action buttons to display */
  actions: Array<{
    label: string;
    onClick: () => void;
  }>;
  /** Optional additional CSS class name */
  className?: string;
}

/**
 * Reusable EmptyState component for displaying empty data states.
 *
 * Features:
 * - Accessible semantic HTML with aria-live region for dynamic content
 * - Native button elements with visible focus rings
 * - Responsive illustration scaling (mobile-first)
 * - Support for multiple action buttons
 *
 * @example
 * <EmptyState
 *   title="Your feed is empty"
 *   description="Start following channels to see content here"
 *   illustrationUrl="/images/empty-tv.svg"
 *   actions={[
 *     { label: 'Explore Trending', onClick: () => navigate('/discover') },
 *     { label: 'Search Channels', onClick: () => openSearchModal() }
 *   ]}
 * />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  illustrationUrl,
  actions,
  className = '',
}) => {
  return (
    <section
      className={`${styles.emptyState} ${className}`}
      aria-labelledby="empty-state-title"
      aria-describedby="empty-state-description"
      role="status"
    >
      {/* Illustration */}
      <div className={styles.illustrationContainer}>
        <img
          src={illustrationUrl}
          alt=""
          className={styles.illustration}
          loading="lazy"
          decoding="async"
        />
      </div>

      {/* Text content */}
      <div className={styles.content}>
        <h2 id="empty-state-title" className={styles.title}>
          {title}
        </h2>
        <p id="empty-state-description" className={styles.description}>
          {description}
        </p>
      </div>

      {/* Actions */}
      {actions.length > 0 && (
        <div className={styles.actions} role="group" aria-label="Empty state actions">
          {actions.map((action, index) => (
            <button
              key={index}
              type="button"
              className={styles.actionButton}
              onClick={action.onClick}
              // Ensure focus ring is visible for keyboard navigation
              // Native button element provides keyboard accessibility by default
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Live region for screen readers to announce state changes */}
      <div
        className={styles.srOnly}
        aria-live="polite"
        aria-atomic="true"
      >
        {title}: {description}
      </div>
    </section>
  );
};

export default EmptyState;