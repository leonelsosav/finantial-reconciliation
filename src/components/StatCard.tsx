import type { ReactNode } from 'react';
import styles from './StatCard.module.scss';

interface Props {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  variant?: 'blue' | 'green' | 'purple' | 'orange' | 'gray';
}

export const StatCard = ({ title, value, subtitle, icon, variant = 'gray' }: Props) => {
  return (
    <div className={styles.card}>
      <div className={`${styles.iconWrapper} ${styles[variant]}`}>
        {icon}
      </div>
      <div className={styles.info}>
        <span className={styles.label}>{title}</span>
        <h3 className={styles.value}>{value}</h3>
        {subtitle && <span className={styles.subtext}>{subtitle}</span>}
      </div>
    </div>
  );
};
