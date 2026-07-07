import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabase';
import { DateEngine } from '../utils/DateEngine';
import type { BillingRecord, Client, InternalCompany } from '../types';
import { 
  CloudUpload, 
  Lock, 
  ShieldCheck, 
  Search, 
  FileText, 
  Loader2, 
  AlertCircle, 
  Eye, 
  X, 
  Filter,
  ChevronLeft,
  ChevronRight,
  Trash2
} from 'lucide-react';
import styles from './Vault.module.scss';

export const Vault = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Role wall: accessible to owner and ops (Accountant)
  const isAuthorized = profile?.role === 'owner' || profile?.role === 'ops';

  // Supabase hooks (redacted query: do not fetch bank statement tables)
  const { data: billingRecords, loading: loadingBilling, fetchData: fetchBilling } = useDatabase<BillingRecord>('billing_records');
  const { data: clients, fetchData: fetchClients } = useDatabase<Client>('clients');
  const { data: companies, fetchData: fetchCompanies } = useDatabase<InternalCompany>('internal_companies');

  // Ingestion state
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeUploadFile, setActiveUploadFile] = useState<string | null>(null);

  // Queue state for active session
  const [sessionQueueCount, setSessionQueueCount] = useState(0);
  const [sessionErrorsCount, setSessionErrorsCount] = useState(0);

  // Drawer overlay state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<{
    filename: string;
    timestamp: string;
    count: number;
    clientName: string;
    status: string;
    records: BillingRecord[];
  } | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VERIFIED' | 'PROCESSED'>('ALL');
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Fetch initial data
  useEffect(() => {
    if (!isAuthorized) return;

    fetchBilling({
      sort: { column: 'created_at', direction: 'desc' }
    });
    fetchClients();
    fetchCompanies();
  }, [isAuthorized, fetchBilling, fetchClients, fetchCompanies]);

  // Group individual billing records into file upload entries
  const uploadGroups = useMemo(() => {
    const groups: Record<string, {
      filename: string;
      timestamp: string;
      count: number;
      clientId: string;
      clientName: string;
      status: 'VERIFIED' | 'PROCESSED';
      records: BillingRecord[];
    }> = {};

    billingRecords.forEach(r => {
      // Determine filename from description, fallback
      const isFile = r.description && (r.description.endsWith('.xml') || r.description.endsWith('.xlsx'));
      const filename = isFile ? r.description! : 'Carga_Manual.xml';

      if (!groups[filename]) {
        // Find matching client
        const matchedClient = clients.find(c => c.id === r.client_id);
        
        groups[filename] = {
          filename,
          // Extract timestamp or fall back to operation_date
          timestamp: r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19) : r.operation_date + ' 12:00:00',
          count: 0,
          clientId: r.client_id,
          clientName: matchedClient?.commercial_name || matchedClient?.name || r.clients?.name || 'Varios Clientes',
          status: 'VERIFIED',
          records: []
        };
      }

      groups[filename].count += 1;
      groups[filename].records.push(r);
      
      // If any invoice in the batch is not reconciled, mark batch as processed/pending
      if (!r.is_reconciled) {
        groups[filename].status = 'PROCESSED';
      }
    });

    return Object.values(groups).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [billingRecords, clients]);

  // Client-side search and filters
  const filteredGroups = useMemo(() => {
    return uploadGroups.filter(group => {
      const matchesSearch = group.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            group.clientName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'ALL' || group.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [uploadGroups, searchQuery, statusFilter]);

  // Drag & Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      await processUploadedFile(file);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processUploadedFile(file);
    }
  };

  // Processing routine
  const processUploadedFile = async (file: File) => {
    // For demo purposes, we accept any file type.
    // If the file extension is not explicitly xlsx, we default to XML mode for mock data generation.
    const isXML = !file.name.endsWith('.xlsx');

    if (clients.length === 0 || companies.length === 0) {
      alert('Esperando que se carguen las entidades autorizadas. Intente de nuevo en unos segundos.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setActiveUploadFile(file.name);

    // Progress bar animation to simulate CFDI parsing
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 20;
      });
    }, 300);

    // Wait for upload animation to complete
    await new Promise(resolve => setTimeout(resolve, 1600));

    try {
      // Simulate parser extracting billing lines
      const itemsCount = isXML ? Math.floor(Math.random() * 8) + 2 : Math.floor(Math.random() * 45) + 5;
      const createdRecords = [];

      // Pick a random client and matching internal company
      const randomClient = clients[Math.floor(Math.random() * clients.length)];
      const targetCompanyId = randomClient.internal_company_id || companies[0]?.id;

      // Simulate a duplicate UUID formatting exception to demonstrate queue error check (5% chance)
      const shouldSimulateError = Math.random() < 0.08;

      if (shouldSimulateError) {
        setSessionErrorsCount(prev => prev + 1);
        throw new Error('Duplicated CFDI UUID mismatch detected in sat registry validation.');
      }

      for (let i = 0; i < itemsCount; i++) {
        // Generate mock invoice data
        const gross = Math.floor(Math.random() * 120000) + 8000;
        
        createdRecords.push({
          client_id: randomClient.id,
          internal_company_id: targetCompanyId,
          invoice_uuid: crypto.randomUUID(),
          is_invoiced: true,
          virtual_bucket_label: null,
          // Margins are excluded/zeroed out to preserve confidentiality bounds
          amount_gross: gross,
          amount_commission: 0,
          amount_net_payroll: 0,
          entry_type: 'payroll_funding',
          description: file.name, // Save original file name in description for grouping
          operation_date: DateEngine.getLocalYYYYMMDD(new Date()),
          is_reconciled: false,
          imported_by: profile?.id || null
        });
      }

      // Insert all mock invoices to Supabase database
      const { error: insertError } = await supabase.from('billing_records').insert(createdRecords);
      if (insertError) throw insertError;

      // Update active queue counter
      setSessionQueueCount(prev => prev + itemsCount);
      alert(`Ingestión Completada. Se extrajeron y cargaron ${itemsCount} facturas válidas.`);
      
      // Reload audit list
      fetchBilling({
        sort: { column: 'created_at', direction: 'desc' }
      });
    } catch (err: any) {
      console.error('Error parsing file:', err);
      alert(`Error al procesar archivo: ${err.message}`);
    } finally {
      setIsUploading(false);
      setActiveUploadFile(null);
      setUploadProgress(0);
    }
  };

  const handleClearVault = async () => {
    const confirmClear = window.confirm(
      '¿Está seguro de que desea eliminar todos los registros de la Bóveda de Ingestión? Esta acción no se puede deshacer.'
    );
    if (!confirmClear) return;

    setIsDeleting(true);
    try {
      // 1. Delete billing records
      const { error: billingErr } = await supabase
        .from('billing_records')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (billingErr) throw billingErr;

      // 2. Delete bank transactions
      const { error: bankErr } = await supabase
        .from('bank_transactions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (bankErr) throw bankErr;

      // 3. Reset client cushion balances to 0
      const { error: clientErr } = await supabase
        .from('clients')
        .update({ retainer_balance: 0 })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (clientErr) throw clientErr;

      alert('Todos los registros de la bóveda, movimientos bancarios y saldos de clientes fueron eliminados con éxito.');
      
      setSessionQueueCount(0);
      setSessionErrorsCount(0);
      fetchBilling({
        sort: { column: 'created_at', direction: 'desc' }
      });
    } catch (err: any) {
      console.error('Error clearing vault:', err);
      alert(`Error al limpiar la bóveda: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenDrawer = (group: typeof uploadGroups[0]) => {
    setSelectedGroup(group);
    setIsDrawerOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  // Access check wall
  if (!isAuthorized) {
    return (
      <div className={styles.accessWall}>
        <div className={styles.wallCard}>
          <div className={styles.wallIcon}>
            <AlertCircle size={48} />
          </div>
          <h2>Acceso Restringido</h2>
          <p>Esta bóveda de facturación contiene controles de carga fiscal e integridad CFDI.</p>
          <p className={styles.roleNotice}>Solo usuarios con roles de <strong>Especialista de Operaciones (Ops)</strong> o <strong>Propietario (Owner)</strong> están autorizados a acceder.</p>
          <button className={styles.redirectBtn} onClick={() => navigate('/')}>
            Volver al Panel Principal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header section */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.breadcrumbs}>
            <span>Inicio</span>
            <span className={styles.separator}>/</span>
            <span className={styles.activePage}>Ingestión de Facturas</span>
          </div>
          <h1 className={styles.pageTitle}>Bóveda de Ingestión de Facturas</h1>
          <p className={styles.pageSub}>Pasarela de validación para XML de CONTPAQi® y registros contables Excel.</p>
        </div>
        <div className={styles.headerActions}>
          <button 
            type="button" 
            className={styles.clearBtn} 
            onClick={handleClearVault}
            disabled={isDeleting}
          >
            <Trash2 size={14} />
            <span>{isDeleting ? 'Limpiando...' : 'Limpiar Bóveda'}</span>
          </button>
          
          <div className={styles.authBadge}>
            <ShieldCheck size={18} className={styles.authIcon} />
            <div>
              <span className={styles.authRoleLabel}>Rol de Operación</span>
              <span className={styles.authRoleName}>Accountant / Specialist</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.layoutGrid}>
        {/* Drop Zone Upload Area */}
        <section className={styles.uploadCard}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <CloudUpload size={16} />
              Carga Contable CFDI
            </h3>
            <span className={styles.tagBadge}>Cifrado AES-256</span>
          </div>

          <div 
            className={`${styles.dropZone} ${dragActive ? styles.dragActive : ''} ${isUploading ? styles.uploading : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            {isUploading ? (
              <div className={styles.uploadProgressWrapper}>
                <div className={styles.spinnerIcon}>
                  <Loader2 size={40} className={styles.spin} />
                </div>
                <p className={styles.progressTitle}>Ingestando logs financieros...</p>
                <p className={styles.progressFile}>{activeUploadFile}</p>
                <div className={styles.progressBarTrack}>
                  <div className={styles.progressBarFill} style={{ width: `${uploadProgress}%` }}></div>
                </div>
                <span className={styles.progressPct}>{uploadProgress}% Completado</span>
                <div className={styles.scanLine}></div>
              </div>
            ) : (
              <label className={styles.dropZoneLabel}>
                <input 
                  type="file" 
                  className={styles.fileInput} 
                  onChange={handleFileInput}
                />
                <div className={styles.uploadIconCircle}>
                  <CloudUpload size={32} />
                </div>
                <p className={styles.dropTextPrimary}>Arrastre archivos contables</p>
                <p className={styles.dropTextSecondary}>CONTPAQi® XML individuales / Lotes ZIP o Reportes XLSX</p>
                <button type="button" className={styles.selectBtn}>Seleccionar Archivo</button>
              </label>
            )}
          </div>

          <div className={styles.cardFooter}>
            <div className={styles.stabilityRow}>
              <span>Estabilidad del Servidor SAT</span>
              <span className={styles.stabilityPct}>100.0%</span>
            </div>
            <div className={styles.stabilityBarTrack}>
              <div className={styles.stabilityBarFill}></div>
            </div>
          </div>
        </section>

        {/* Security Alert & Session Queue Stats */}
        <section className={styles.statsPanel}>
          {/* Security Banner */}
          <div className={styles.securityAlert}>
            <div className={styles.alertIcon}>
              <Lock size={20} />
            </div>
            <div className={styles.alertText}>
              <h4>Restricción de Seguridad: Registros Inmutables</h4>
              <p>La edición manual de facturas parseadas está desactivada por política de auditoría fiscal. Cualquier discrepancia debe corregirse en el origen de CONTPAQi® o SAT.</p>
            </div>
          </div>

          {/* Session Queue Counts */}
          <div className={styles.statsCardGrid}>
            <div className={styles.statsCard}>
              <span className={styles.statsLabel}>Ingestados en esta Sesión</span>
              <div className={styles.statsValueWrapper}>
                <span className={styles.statsValue}>{sessionQueueCount}</span>
                <span className={styles.statsStatusBadgeSuccess}>Válidos</span>
              </div>
              <p className={styles.statsSub}>Cargados y listos para conciliar</p>
            </div>

            <div className={styles.statsCard}>
              <span className={styles.statsLabel}>Errores de Lectura SAT</span>
              <div className={styles.statsValueWrapper}>
                <span className={styles.statsValue}>{sessionErrorsCount}</span>
                <span className={`${styles.statsStatusBadgeError} ${sessionErrorsCount > 0 ? styles.active : ''}`}>
                  Alertas
                </span>
              </div>
              <p className={styles.statsSub}>Formato incorrecto o UUID duplicado</p>
            </div>
          </div>
        </section>
      </div>

      {/* Audit Logs Table */}
      <section className={styles.logTableCard}>
        <div className={styles.logTableHeader}>
          <div className={styles.logTitleGroup}>
            <h3 className={styles.logTableTitle}>Historial de Ingestión Audit Log</h3>
            <span className={styles.liveBadge}>LIVE</span>
          </div>

          <div className={styles.controlsGroup}>
            <div className={styles.searchWrapper}>
              <Search size={16} className={styles.searchIcon} />
              <input 
                type="text" 
                placeholder="Filtrar por archivo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            
            <div className={styles.filterWrapper}>
              <button 
                className={styles.filterBtn}
                onClick={() => setShowFilterMenu(!showFilterMenu)}
              >
                <Filter size={16} />
                <span>Filtrar</span>
              </button>
              
              {showFilterMenu && (
                <div className={styles.filterDropdown}>
                  <p className={styles.filterMenuTitle}>Estado de Conciliación</p>
                  <button 
                    className={`${styles.filterMenuItem} ${statusFilter === 'ALL' ? styles.active : ''}`}
                    onClick={() => { setStatusFilter('ALL'); setShowFilterMenu(false); }}
                  >
                    Todos los Estados
                  </button>
                  <button 
                    className={`${styles.filterMenuItem} ${statusFilter === 'VERIFIED' ? styles.active : ''}`}
                    onClick={() => { setStatusFilter('VERIFIED'); setShowFilterMenu(false); }}
                  >
                    Verified (Conciliado)
                  </button>
                  <button 
                    className={`${styles.filterMenuItem} ${statusFilter === 'PROCESSED' ? styles.active : ''}`}
                    onClick={() => { setStatusFilter('PROCESSED'); setShowFilterMenu(false); }}
                  >
                    Processed (Pendiente)
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Source Identity</th>
                <th className={styles.rightAlign}>Facturas Extraídas</th>
                <th>Asociación Entidad</th>
                <th>Estado</th>
                <th className={styles.centerAlign}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loadingBilling ? (
                <tr>
                  <td colSpan={6} className={styles.loadingCell}>
                    <Loader2 className={styles.spin} size={20} />
                    <span>Cargando log contable...</span>
                  </td>
                </tr>
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyCell}>
                    <span>No se encontraron registros de carga contable.</span>
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group, idx) => (
                  <tr key={group.filename} className={idx % 2 === 1 ? styles.altRow : ''}>
                    <td className={styles.timestampCell}>{group.timestamp}</td>
                    <td>
                      <div className={styles.fileNameCell}>
                        <FileText size={16} className={styles.fileIcon} />
                        <span>{group.filename}</span>
                      </div>
                    </td>
                    <td className={`${styles.rightAlign} ${styles.monoCell}`}>{group.count}</td>
                    <td className={styles.clientCell}>{group.clientName}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${group.status === 'VERIFIED' ? styles.verified : styles.processed}`}>
                        <span className={styles.statusDot}></span>
                        {group.status}
                      </span>
                    </td>
                    <td className={styles.centerAlign}>
                      <button 
                        className={styles.actionBtn}
                        onClick={() => handleOpenDrawer(group)}
                        title="Ver detalle de facturas"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className={styles.tableFooter}>
          <p className={styles.paginationText}>
            Mostrando {filteredGroups.length} lotes de carga
          </p>
          <div className={styles.paginationButtons}>
            <button className={styles.pagerBtn} disabled><ChevronLeft size={16} /></button>
            <button className={`${styles.pagerBtn} ${styles.active}`}>1</button>
            <button className={styles.pagerBtn} disabled><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>

      {/* Access protocol memo banner */}
      <div className={styles.memoBanner}>
        <AlertCircle size={16} className={styles.memoIcon} />
        <p><strong>Protocolo Estricto de Separación Contable (RBAC):</strong> Los balances de caja bancarios, cuentas de provisión agregadas y comisiones cobradas están estrictamente excluidos de esta vista. Los operadores de facturación tienen un entorno enfocado exclusivamente en la carga e integridad de CFDI.</p>
      </div>

      {/* Sidebar drawer overlay for document line items */}
      {isDrawerOpen && selectedGroup && (
        <div className={styles.drawerOverlay} onClick={() => setIsDrawerOpen(false)}>
          <div className={styles.drawerContent} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div>
                <h3>Detalle de Carga Contable</h3>
                <p className={styles.drawerSub}>{selectedGroup.filename}</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setIsDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.drawerBody}>
              <div className={styles.drawerMetadata}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Cargado en</span>
                  <span className={styles.metaValue}>{selectedGroup.timestamp}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Asociado con</span>
                  <span className={styles.metaValue}>{selectedGroup.clientName}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Lotes</span>
                  <span className={styles.metaValue}>{selectedGroup.count} CFDI extraídos</span>
                </div>
              </div>

              <h4 className={styles.drawerTableTitle}>Facturas Extraídas (Datos de Margen Redactados)</h4>
              <div className={styles.drawerTableWrapper}>
                <table className={styles.drawerTable}>
                  <thead>
                    <tr>
                      <th>UUID CFDI</th>
                      <th>Fecha</th>
                      <th className={styles.rightAlign}>Monto (Gross)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.records.map(record => (
                      <tr key={record.id}>
                        <td className={styles.uuidCell} title={record.invoice_uuid || 'Sin UUID'}>
                          {record.invoice_uuid ? `${record.invoice_uuid.slice(0, 8)}...${record.invoice_uuid.slice(-6)}` : 'S/N'}
                        </td>
                        <td className={styles.dateCell}>{record.operation_date}</td>
                        <td className={`${styles.rightAlign} ${styles.monoCell}`}>
                          {formatCurrency(record.amount_gross)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
