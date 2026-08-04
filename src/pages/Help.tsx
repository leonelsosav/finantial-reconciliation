import { useState } from 'react';
import { 
  Mail, 
  Phone, 
  User, 
  Copy, 
  Check, 
  MessageSquare,
  HelpCircle,
  ShieldCheck,
  Code
} from 'lucide-react';
import styles from './Help.module.scss';

export const Help = () => {
  const [copiedText, setCopiedText] = useState<'email' | 'phone' | null>(null);

  const contactEmail = 'ernesto.leonel.vera.sosa@gmail.com';
  const contactPhone = '+529988455061';

  const handleCopy = async (text: string, type: 'email' | 'phone') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(type);
      setTimeout(() => setCopiedText(null), 2000);
    } catch (err) {
      console.error('Error copying text:', err);
    }
  };

  return (
    <div className={styles.container}>
      {/* Header section with breadcrumbs */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.breadcrumbs}>
            <span>Soporte</span>
            <span className={styles.separator}>/</span>
            <span className={styles.activePage}>Ayuda y Contacto</span>
          </div>
          <h2 className={styles.pageTitle}>Centro de Soporte Técnico</h2>
          <p className={styles.pageSub}>
            ¿Tienes dudas o experimentas algún problema con la plataforma? Estamos para ayudarte.
          </p>
        </div>
      </div>

      <div className={styles.layoutGrid}>
        {/* Main Support Contact Card */}
        <div className={styles.supportCard}>
          <div className={styles.cardHeader}>
            <div className={styles.avatarCircle}>
              <User size={32} />
            </div>
            <div className={styles.avatarMeta}>
              <h3>Leonel Vera</h3>
              <p>Desarrollador Principal & Soporte</p>
            </div>
          </div>

          <div className={styles.cardBody}>
            <p className={styles.supportIntro}>
              Para cualquier reporte de error, sugerencia de mejora, o asistencia técnica con la conciliación y el procesamiento de archivos XML, por favor utiliza los siguientes canales de atención directa:
            </p>

            <div className={styles.contactItems}>
              {/* Email Contact Detail Row */}
              <div className={styles.contactRow}>
                <div className={styles.contactLabel}>
                  <Mail size={18} />
                  <span>Correo Electrónico</span>
                </div>
                <div className={styles.contactActionGroup}>
                  <a href={`mailto:${contactEmail}`} className={styles.contactValue}>
                    {contactEmail}
                  </a>
                  <button 
                    onClick={() => handleCopy(contactEmail, 'email')} 
                    className={styles.copyBtn}
                    title="Copiar correo"
                  >
                    {copiedText === 'email' ? <Check size={16} className={styles.copiedIcon} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              {/* Phone Contact Detail Row */}
              <div className={styles.contactRow}>
                <div className={styles.contactLabel}>
                  <Phone size={18} />
                  <span>Teléfono / WhatsApp</span>
                </div>
                <div className={styles.contactActionGroup}>
                  <a href={`tel:${contactPhone}`} className={styles.contactValue}>
                    {contactPhone}
                  </a>
                  <button 
                    onClick={() => handleCopy(contactPhone, 'phone')} 
                    className={styles.copyBtn}
                    title="Copiar teléfono"
                  >
                    {copiedText === 'phone' ? <Check size={16} className={styles.copiedIcon} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.cardFooter}>
            <a 
              href={`https://wa.me/${contactPhone.replace('+', '')}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className={styles.actionBtn}
            >
              <MessageSquare size={16} />
              <span>Enviar Mensaje Directo</span>
            </a>
            <a href={`mailto:${contactEmail}`} className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}>
              <Mail size={16} />
              <span>Enviar Correo</span>
            </a>
          </div>
        </div>

        {/* Informative Side Card / FAQ */}
        <div className={styles.infoCard}>
          <h3>Información Útil antes de reportar</h3>
          
          <div className={styles.faqList}>
            <div className={styles.faqItem}>
              <div className={styles.faqTitle}>
                <ShieldCheck size={16} />
                <h4>¿Qué información incluir en tu reporte?</h4>
              </div>
              <p>
                Para resolver tu problema lo más rápido posible, te recomendamos incluir una descripción detallada del error, capturas de pantalla, y en caso de fallas de carga, adjuntar los archivos XML o capturas bancarias que causaron el inconveniente.
              </p>
            </div>

            <div className={styles.faqItem}>
              <div className={styles.faqTitle}>
                <Code size={16} />
                <h4>Errores de Ingestión en la Bóveda</h4>
              </div>
              <p>
                Si ves alertas de error en la carga de XML, recuerda verificar que la Razón Social o el RFC del receptor estén registrados previamente en el Catálogo de Clientes del sistema.
              </p>
            </div>

            <div className={styles.faqItem}>
              <div className={styles.faqTitle}>
                <HelpCircle size={16} />
                <h4>Horario de Atención</h4>
              </div>
              <p>
                Atención directa de lunes a viernes en horario laboral. Los reportes enviados por correo fuera de este horario serán atendidos a primera hora del siguiente día hábil.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
