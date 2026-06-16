import type { ReactNode } from 'react';
import styles from './Card.module.scss';

interface Props {
  title?: string;
  children: ReactNode;
  headerAction?: ReactNode;
  className?: string;
}

export const Card = ({ title, children, headerAction, className = '' }: Props) => {
  return (
    <section className={`${styles.card} ${className}`}>
      {(title || headerAction) && (
        <div className={styles.header}>
          {title && <h2>{title}</h2>}
          {headerAction && <div className={styles.action}>{headerAction}</div>}
        </div>
      )}
      <div className={styles.content}>
        {children}
      </div>
    </section>
  );
};
