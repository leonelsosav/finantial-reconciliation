import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabase';
import { DateEngine } from '../utils/DateEngine';
import type { BillingRecord, Client, InternalCompany } from '../types';
import { 
  CloudUpload, 
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
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeUploadFile, setActiveUploadFile] = useState<string | null>(null);

  // Set default company when companies load
  useEffect(() => {
    if (companies.length > 0 && !selectedCompanyId) {
      const defaultCompany = companies.find(c => c.id === profile?.internal_company_id) || companies[0];
      setSelectedCompanyId(defaultCompany.id);
    }
  }, [companies, profile, selectedCompanyId]);

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

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 8;

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
      // Group strictly by description (which will contain either the filename or the batch folder name)
      const filename = r.description || 'Carga_Manual.xml';

      if (!groups[filename]) {
        groups[filename] = {
          filename,
          // Extract timestamp or fall back to operation_date
          timestamp: r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19) : r.operation_date + ' 12:00:00',
          count: 0,
          clientId: r.client_id,
          clientName: '', // Will be calculated after grouping
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

    const result = Object.values(groups);
    
    // Post-process to summarize client names dynamically
    result.forEach(group => {
      const uniqueClientIds = Array.from(new Set(group.records.map(r => r.client_id)));
      if (uniqueClientIds.length === 1) {
        const client = clients.find(c => c.id === uniqueClientIds[0]);
        group.clientName = client?.commercial_name || client?.name || 'Cliente';
      } else if (uniqueClientIds.length > 1) {
        const names = uniqueClientIds.map(id => {
          const client = clients.find(c => c.id === id);
          return client?.commercial_name || client?.name;
        }).filter(Boolean);

        if (names.length <= 2) {
          group.clientName = names.join(', ');
        } else {
          group.clientName = 'Varios Clientes';
        }
      } else {
        group.clientName = 'Sin Cliente';
      }
    });

    return result.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
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

  // Paginated groups for table display
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredGroups.slice(start, start + itemsPerPage);
  }, [filteredGroups, currentPage]);

  // Reset pagination on search or status change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processUploadedFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processUploadedFiles(e.target.files);
    }
  };

  const handleFolderInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processUploadedFiles(e.target.files);
    }
  };

  // Processing routine for multiple files / folder
  const processUploadedFiles = async (filesList: FileList | File[]) => {
    if (!selectedCompanyId) {
      alert('Por favor, seleccione una empresa interna antes de cargar las facturas.');
      return;
    }
    if (clients.length === 0 || companies.length === 0) {
      alert('Esperando que se carguen las entidades autorizadas. Intente de nuevo en unos segundos.');
      return;
    }

    const xmlFiles = Array.from(filesList).filter(f => f.name.toLowerCase().endsWith('.xml'));
    if (xmlFiles.length === 0) {
      alert('No se encontraron archivos XML válidos para procesar.');
      return;
    }

    // Determine shared batch name for grouping
    const firstWithRelativePath = xmlFiles.find(f => (f as any).webkitRelativePath);
    let batchName = '';
    if (firstWithRelativePath) {
      const relPath = (firstWithRelativePath as any).webkitRelativePath;
      const parts = relPath.split('/');
      if (parts.length > 1) {
        batchName = `Lote: ${parts[0]}`;
      }
    }

    if (!batchName) {
      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      batchName = xmlFiles.length > 1 
        ? `Lote: ${xmlFiles.length} Facturas (${nowStr})` 
        : xmlFiles[0].name;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setSessionErrorsCount(0);

    const totalFiles = xmlFiles.length;
    let parsedCount = 0;
    let successCount = 0;
    let warningCount = 0;
    const parsedInvoices: any[] = [];

    // Helper to read file text content
    const readFileText = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = () => reject(new Error(`Error de lectura en ${file.name}`));
        reader.readAsText(file);
      });
    };

    // Helper to extract elements ignoring namespace prefixes
    const getElementByLocalName = (doc: Document, localName: string): Element | null => {
      const tags = doc.getElementsByTagName(`cfdi:${localName}`);
      if (tags.length > 0) return tags[0];
      const tagsNoPrefix = doc.getElementsByTagName(localName);
      if (tagsNoPrefix.length > 0) return tagsNoPrefix[0];
      const allElements = doc.getElementsByTagName('*');
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        if (el.localName === localName || el.tagName.endsWith(':' + localName)) {
          return el;
        }
      }
      return null;
    };

    for (let i = 0; i < totalFiles; i++) {
      const file = xmlFiles[i];
      setActiveUploadFile(file.name);

      try {
        const xmlText = await readFileText(file);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const parseError = xmlDoc.getElementsByTagName('parsererror');
        if (parseError.length > 0) {
          throw new Error('Formato XML no válido o corrupto');
        }

        const comprobanteEl = getElementByLocalName(xmlDoc, 'Comprobante');
        if (!comprobanteEl) {
          throw new Error('No se encontró el nodo Comprobante');
        }

        const receptorEl = getElementByLocalName(xmlDoc, 'Receptor');
        const timbreEl = getElementByLocalName(xmlDoc, 'TimbreFiscalDigital');

        const receptorRfc = receptorEl?.getAttribute('Rfc') || '';
        const receptorNombre = receptorEl?.getAttribute('Nombre') || '';
        const uuid = timbreEl?.getAttribute('UUID') || '';
        const total = Number(comprobanteEl.getAttribute('Total') || 0);
        const fechaAttr = comprobanteEl.getAttribute('Fecha') || '';
        const operationDate = fechaAttr.split('T')[0] || DateEngine.getLocalYYYYMMDD(new Date());

        if (!uuid) {
          throw new Error('No se encontró el UUID del timbre fiscal (UUID)');
        }

        // Match Client by Receptor RFC (case-insensitive)
        let matchedClient = clients.find(c => c.tax_id?.trim().toUpperCase() === receptorRfc.trim().toUpperCase());

        // Substring / Name fallback if RFC does not match directly
        if (!matchedClient && receptorNombre) {
          matchedClient = clients.find(c => 
            receptorNombre.toLowerCase().includes(c.name.toLowerCase()) ||
            c.name.toLowerCase().includes(receptorNombre.toLowerCase()) ||
            (c.legal_name && (receptorNombre.toLowerCase().includes(c.legal_name.toLowerCase()) || c.legal_name.toLowerCase().includes(receptorNombre.toLowerCase()))) ||
            (c.commercial_name && (receptorNombre.toLowerCase().includes(c.commercial_name.toLowerCase()) || c.commercial_name.toLowerCase().includes(receptorNombre.toLowerCase())))
          );
        }

        let clientId = matchedClient?.id;
        if (!clientId) {
          // Fallback to first client under the selected company, or first client globally
          const companyClients = clients.filter(c => c.internal_company_id === selectedCompanyId);
          if (companyClients.length > 0) {
            clientId = companyClients[0].id;
          } else if (clients.length > 0) {
            clientId = clients[0].id;
          }
          warningCount++;
        }

        const clientObj = clients.find(c => c.id === clientId);
        const commissionPercent = clientObj?.commission_percentage || 0;
        const amountCommission = total * (commissionPercent / 100);
        const amountNetPayroll = total - amountCommission;

        parsedInvoices.push({
          client_id: clientId,
          internal_company_id: selectedCompanyId,
          invoice_uuid: uuid,
          is_invoiced: true,
          virtual_bucket_label: null,
          amount_gross: total,
          amount_commission: amountCommission,
          amount_net_payroll: amountNetPayroll,
          entry_type: 'payroll_funding',
          description: batchName, // Save batch label in description for grouping
          operation_date: operationDate,
          is_reconciled: false,
          imported_by: profile?.id || null
        });

        successCount++;
      } catch (err: any) {
        console.error(`Error al procesar archivo ${file.name}:`, err);
        setSessionErrorsCount(prev => prev + 1);
      }

      parsedCount++;
      setUploadProgress(Math.round((parsedCount / totalFiles) * 100));
    }

    if (parsedInvoices.length === 0) {
      alert('No se pudo extraer ninguna factura válida de los archivos cargados.');
      setIsUploading(false);
      setActiveUploadFile(null);
      return;
    }

    try {
      setActiveUploadFile('Verificando duplicados en la base de datos...');
      const uuids = parsedInvoices.map(x => x.invoice_uuid);

      // Query database for existing UUIDs in chunks of 50 to avoid query size limits
      const existingUuids = new Set<string>();
      const chunkSize = 50;
      for (let i = 0; i < uuids.length; i += chunkSize) {
        const chunk = uuids.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('billing_records')
          .select('invoice_uuid')
          .in('invoice_uuid', chunk);

        if (error) throw error;
        if (data) {
          data.forEach(row => {
            if (row.invoice_uuid) existingUuids.add(row.invoice_uuid);
          });
        }
      }

      // Filter out duplicate invoices
      const uniqueParsedInvoices = parsedInvoices.filter(x => !existingUuids.has(x.invoice_uuid));
      const duplicatesCount = parsedInvoices.length - uniqueParsedInvoices.length;

      if (uniqueParsedInvoices.length > 0) {
        setActiveUploadFile(`Guardando ${uniqueParsedInvoices.length} facturas nuevas...`);
        const { error: insertError } = await supabase.from('billing_records').insert(uniqueParsedInvoices);
        if (insertError) throw insertError;
      }

      setSessionQueueCount(prev => prev + uniqueParsedInvoices.length);

      let message = `Ingestión finalizada.\n`;
      message += `- Cargadas con éxito: ${uniqueParsedInvoices.length} facturas\n`;
      if (duplicatesCount > 0) {
        message += `- Omitidas por duplicadas: ${duplicatesCount}\n`;
      }
      if (warningCount > 0) {
        message += `- Advertencias (clientes no identificados asignados por defecto): ${warningCount}\n`;
      }
      alert(message);

      // Reload audit list
      fetchBilling({
        sort: { column: 'created_at', direction: 'desc' }
      });
    } catch (err: any) {
      console.error('Error al guardar facturas:', err);
      alert(`Error al guardar facturas: ${err.message}`);
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
            <span className={styles.activePage}>Carga de Facturas</span>
          </div>
          <h1 className={styles.pageTitle}>Carga de Facturas</h1>
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

          <div className={styles.companySelectWrapper}>
            <label htmlFor="companySelect" className={styles.selectLabel}>Empresa Interna Destino</label>
            <select
              id="companySelect"
              className={styles.companySelect}
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              disabled={isUploading}
            >
              <option value="" disabled>Seleccione una empresa...</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.tax_id ? `(${c.tax_id})` : ''}
                </option>
              ))}
            </select>
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
              <div>
                <input 
                  type="file" 
                  id="file-upload-input"
                  className={styles.fileInput} 
                  onChange={handleFileInput}
                  multiple
                  accept=".xml"
                />
                <input 
                  type="file" 
                  id="folder-upload-input"
                  className={styles.fileInput} 
                  ref={(input) => {
                    if (input) {
                      input.setAttribute('webkitdirectory', '');
                      input.setAttribute('directory', '');
                    }
                  }}
                  onChange={handleFolderInput}
                />
                <div className={styles.uploadIconCircle}>
                  <CloudUpload size={32} />
                </div>
                <p className={styles.dropTextPrimary}>Arrastre archivos XML o carpetas aquí</p>
                <p className={styles.dropTextSecondary}>Carga de facturas XML individuales o carpetas de facturación</p>
                
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '12px' }}>
                  <button 
                    type="button" 
                    className={styles.selectBtn}
                    onClick={() => document.getElementById('file-upload-input')?.click()}
                  >
                    Seleccionar Archivos
                  </button>
                  <button 
                    type="button" 
                    className={styles.folderBtn}
                    onClick={() => document.getElementById('folder-upload-input')?.click()}
                  >
                    Seleccionar Carpeta
                  </button>
                </div>
              </div>
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

        {/* Session Queue Stats */}
        <section className={styles.statsPanel}>
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
                paginatedGroups.map((group, idx) => (
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
            Mostrando {Math.min(filteredGroups.length, currentPage * itemsPerPage)} de {filteredGroups.length} lotes de carga
          </p>
          <div className={styles.paginationButtons}>
            <button 
              className={styles.pagerBtn} 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '12px', fontWeight: 'bold', alignSelf: 'center', padding: '0 8px' }}>
              {currentPage}
            </span>
            <button 
              className={styles.pagerBtn} 
              disabled={currentPage * itemsPerPage >= filteredGroups.length}
              onClick={() => setCurrentPage(prev => prev + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

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
                      <th>Cliente</th>
                      <th>Fecha</th>
                      <th className={styles.rightAlign}>Monto (Gross)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.records.map(record => {
                      const recordClient = clients.find(c => c.id === record.client_id);
                      const recordClientName = recordClient?.commercial_name || recordClient?.name || 'Cliente';
                      return (
                        <tr key={record.id}>
                          <td className={styles.uuidCell} title={record.invoice_uuid || 'Sin UUID'}>
                            {record.invoice_uuid ? `${record.invoice_uuid.slice(0, 8)}...${record.invoice_uuid.slice(-6)}` : 'S/N'}
                          </td>
                          <td className={styles.clientCell} title={recordClientName}>
                            {recordClientName}
                          </td>
                          <td className={styles.dateCell}>{record.operation_date}</td>
                          <td className={`${styles.rightAlign} ${styles.monoCell}`}>
                            {formatCurrency(record.amount_gross)}
                          </td>
                        </tr>
                      );
                    })}
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
