import { Info, CheckCircle, AlertOctagon, HelpCircle } from 'lucide-react';
import styles from './ModalAlert.module.scss';

interface Props {
  isOpen: boolean;
  type: 'info' | 'success' | 'error' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
  onClose: () => void;
}

export const ModalAlert = ({ isOpen, type, title, message, onConfirm, onClose }: Props) => {
  if (!isOpen) return null;

  const renderIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className={styles.successIcon} size={48} />;
      case 'error':
        return <AlertOctagon className={styles.errorIcon} size={48} />;
      case 'confirm':
        return <HelpCircle className={styles.confirmIcon} size={48} />;
      default:
        return <Info className={styles.infoIcon} size={48} />;
    }
  };

  return (
    <div className={styles.overlay} onClick={type !== 'confirm' ? onClose : undefined}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.iconContainer}>
          {renderIcon()}
        </div>
        <h4 className={styles.title}>{title}</h4>
        <p className={styles.message}>{message}</p>
        
        <div className={styles.actions}>
          {type === 'confirm' ? (
            <>
              <button className={styles.cancelBtn} onClick={onClose}>
                Cancelar
              </button>
              <button 
                className={styles.confirmBtn} 
                onClick={() => {
                  if (onConfirm) onConfirm();
                  onClose();
                }}
              >
                Aceptar
              </button>
            </>
          ) : (
            <button className={styles.okBtn} onClick={onClose}>
              Aceptar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
