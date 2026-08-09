import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import { supabase } from '../lib/supabase';
import { DateEngine } from '../utils/DateEngine';
import { ModalAlert } from '../components/ModalAlert';
import { ReconciliationService } from '../services/reconciliation.service';
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
  CheckCircle2,
  ClipboardList
} from 'lucide-react';
import styles from './Vault.module.scss';

interface IngestionLog {
  filename: string;
  type: 'success' | 'warning' | 'error';
  message: string;
  uuid?: string;
  amount?: number;
  timestamp: string;
}

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

  // Ingestion reporting states
  const [ingestionLogs, setIngestionLogs] = useState<IngestionLog[]>([]);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logActiveTab, setLogActiveTab] = useState<'ALL' | 'SUCCESS' | 'ERROR'>('ALL');

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'info' | 'success' | 'error' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    title: '',
    message: ''
  });

  const showAlert = (type: 'info' | 'success' | 'error' | 'confirm', title: string, message: string, onConfirm?: () => void) => {
    setModalConfig({
      isOpen: true,
      type,
      title,
      message,
      onConfirm
    });
  };



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

  // Ingestion stats derivations
  const successLogsCount = useMemo(() => ingestionLogs.filter(l => l.type === 'success').length, [ingestionLogs]);
  const errorLogsCount = useMemo(() => ingestionLogs.filter(l => l.type === 'error').length, [ingestionLogs]);

  const filteredLogs = useMemo(() => {
    return ingestionLogs.filter(log => {
      // 1. Search filter
      const matchesSearch = log.filename.toLowerCase().includes(logSearchQuery.toLowerCase()) || 
        log.message.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        (log.uuid && log.uuid.toLowerCase().includes(logSearchQuery.toLowerCase()));

      // 2. Tab filter
      if (logActiveTab === 'SUCCESS') return matchesSearch && log.type === 'success';
      if (logActiveTab === 'ERROR') return matchesSearch && log.type === 'error';
      return matchesSearch;
    });
  }, [ingestionLogs, logSearchQuery, logActiveTab]);

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

  const handleFolderInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processUploadedFiles(e.target.files);
    }
  };

  const handleCanceledInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processUploadedFiles(e.target.files, true);
    }
  };

  // Processing routine for multiple files / folder
  const processUploadedFiles = async (filesList: FileList | File[], forceCanceled: boolean = false) => {
    if (clients.length === 0 || companies.length === 0) {
      showAlert('info', 'Cargando Catálogos', 'Esperando que se carguen las entidades autorizadas. Intente de nuevo en unos segundos.');
      return;
    }

    const xmlFiles = Array.from(filesList).filter(f => f.name.toLowerCase().endsWith('.xml'));
    if (xmlFiles.length === 0) {
      showAlert('info', 'Sin Archivos XML', 'No se encontraron archivos XML válidos para procesar.');
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
    setIngestionLogs([]);

    const totalFiles = xmlFiles.length;
    let parsedCount = 0;
    let successCount = 0;
    const parsedInvoices: any[] = [];
    const tempLogs: IngestionLog[] = [];
    const uuidToFilenameMap = new Map<string, string>();

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
        let xmlText = await readFileText(file);
        // Strip any junk characters (like BOM or odd leading indicators) before <?xml tag
        const xmlStartIdx = xmlText.indexOf('<?xml');
        if (xmlStartIdx > 0) {
          xmlText = xmlText.substring(xmlStartIdx);
        }
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

        const emisorEl = getElementByLocalName(xmlDoc, 'Emisor');
        const receptorEl = getElementByLocalName(xmlDoc, 'Receptor');
        const timbreEl = getElementByLocalName(xmlDoc, 'TimbreFiscalDigital');

        const emisorRfc = emisorEl?.getAttribute('Rfc') || '';
        const emisorNombre = emisorEl?.getAttribute('Nombre') || '';
        const receptorRfc = receptorEl?.getAttribute('Rfc') || '';
        const receptorNombre = receptorEl?.getAttribute('Nombre') || '';
        const uuid = timbreEl?.getAttribute('UUID') || '';
        const total = Number(comprobanteEl.getAttribute('Total') || 0);
        const fechaAttr = comprobanteEl.getAttribute('Fecha') || '';
        const operationDate = fechaAttr.split('T')[0] || DateEngine.getLocalYYYYMMDD(new Date());

        if (!uuid) {
          throw new Error('No se encontró el UUID del timbre fiscal (UUID)');
        }

        uuidToFilenameMap.set(uuid, file.name);

        // 1. Match Internal Company by Emisor RFC (case-insensitive)
        let matchedCompany = companies.find(c => c.tax_id?.trim().toUpperCase() === emisorRfc.trim().toUpperCase());
        if (!matchedCompany && emisorNombre) {
          matchedCompany = companies.find(c => 
            emisorNombre.toLowerCase().includes(c.name.toLowerCase()) ||
            c.name.toLowerCase().includes(emisorNombre.toLowerCase())
          );
        }

        let internalCompanyId = matchedCompany?.id;
        if (!internalCompanyId) {
          throw new Error(`Emisor (${emisorRfc}) no configurado como empresa interna.`);
        }

        // 2. Match Client by Receptor RFC (case-insensitive)
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
        const isIntercompany = companies.some(c => c.tax_id?.trim().toUpperCase() === receptorRfc.trim().toUpperCase());

        if (!clientId && isIntercompany) {
          // If Receptor is an internal company, try to match by RFC in clients table first
          const intercompanyClient = clients.find(c => c.tax_id?.trim().toUpperCase() === receptorRfc.trim().toUpperCase());
          if (intercompanyClient) {
            clientId = intercompanyClient.id;
          } else {
            // Fallback to first client under the resolved company or first globally to satisfy DB constraint
            const companyClients = clients.filter(c => c.internal_company_id === internalCompanyId);
            if (companyClients.length > 0) {
              clientId = companyClients[0].id;
            } else if (clients.length > 0) {
              clientId = clients[0].id;
            }
          }
        }

        if (!clientId) {
          throw new Error(`Receptor (${receptorRfc}) no registrado en el catálogo de clientes.`);
        }

        const clientObj = clients.find(c => c.id === clientId);
        const commissionPercent = clientObj?.commission_percentage || 0;

        const isCanceledPath = (file.webkitRelativePath || '').toLowerCase().includes('cancelado');
        const isCanceledName = (file.name || '').toLowerCase().includes('cancelado');
        const isCanceled = forceCanceled || isCanceledPath || isCanceledName;

        const tipoComprobante = comprobanteEl.getAttribute('TipoDeComprobante') || '';

        if (tipoComprobante === 'P') {
          // Check if this REP itself is already canceled in DB or is being loaded as canceled
          if (isCanceled) {
            const { data: existingRecord, error: getErr } = await supabase
              .from('billing_records')
              .select('id, is_reconciled, bank_transaction_id')
              .eq('invoice_uuid', uuid)
              .maybeSingle();

            if (getErr) throw getErr;

            if (existingRecord) {
              if (existingRecord.is_reconciled && existingRecord.bank_transaction_id) {
                const { error: bankErr } = await supabase
                  .from('bank_transactions')
                  .update({ is_reconciled: false })
                  .eq('id', existingRecord.bank_transaction_id);
                if (bankErr) throw bankErr;
              }

              const { error: updateErr } = await supabase
                .from('billing_records')
                .update({ 
                  is_canceled: true, 
                  is_reconciled: false, 
                  bank_transaction_id: null 
                })
                .eq('id', existingRecord.id);
              
              if (updateErr) throw updateErr;

              tempLogs.push({
                filename: file.name,
                type: 'warning',
                message: `REP cancelado con éxito (existente en BD).`,
                uuid: uuid,
                amount: 0,
                timestamp: new Date().toLocaleTimeString()
              });
              successCount++;
              continue;
            }
          }

          // Parse payment nodes (wildcard matching to handle different namespaces for pagos10 and pagos20)
          const pagoNodes = xmlDoc.getElementsByTagNameNS('*', 'Pago');
          const paymentsToInsert: { amount: number; parentUuid: string | null; parcialidad: string | null; opDate: string }[] = [];

          for (let p = 0; p < pagoNodes.length; p++) {
            const pagoNode = pagoNodes[p];
            const monto = Number(pagoNode.getAttribute('Monto') || 0);
            const fechaPago = pagoNode.getAttribute('FechaPago') || operationDate;
            const opDate = fechaPago.split('T')[0] || operationDate;

            const docRelNodes = pagoNode.getElementsByTagNameNS('*', 'DoctoRelacionado');
            if (docRelNodes.length > 0) {
              for (let d = 0; d < docRelNodes.length; d++) {
                const docRelNode = docRelNodes[d];
                const idDocumento = docRelNode.getAttribute('IdDocumento') || '';
                const impPagadoAttr = docRelNode.getAttribute('ImpPagado');
                const impPagado = impPagadoAttr ? Number(impPagadoAttr) : (monto / docRelNodes.length);
                const numParcialidad = docRelNode.getAttribute('NumParcialidad') || '1';

                paymentsToInsert.push({
                  amount: impPagado,
                  parentUuid: idDocumento,
                  parcialidad: numParcialidad,
                  opDate: opDate
                });
              }
            } else {
              paymentsToInsert.push({
                amount: monto,
                parentUuid: null,
                parcialidad: null,
                opDate: opDate
              });
            }
          }

          if (paymentsToInsert.length === 0) {
            throw new Error('No se encontraron transacciones de pago válidas en el XML del REP.');
          }

          for (const pay of paymentsToInsert) {
            const amountGross = pay.amount;
            const amountCommission = amountGross * (commissionPercent / 100);
            const amountNetPayroll = amountGross - amountCommission;

            parsedInvoices.push({
              client_id: clientId,
              internal_company_id: internalCompanyId,
              invoice_uuid: uuid, // Shared REP UUID
              is_invoiced: true,
              virtual_bucket_label: pay.parentUuid ? `${pay.parentUuid}:${pay.parcialidad || 1}` : null,
              amount_gross: amountGross,
              amount_commission: amountCommission,
              amount_net_payroll: amountNetPayroll,
              entry_type: 'payroll_funding',
              description: isIntercompany ? `${batchName} (Intercompañía)` : batchName,
              operation_date: pay.opDate,
              is_reconciled: false,
              is_canceled: isCanceled,
              imported_by: profile?.id || null
            });
          }

          successCount++;
        } else {
          // Standard Invoice processing (Ingreso, Egreso, Traslado, etc.)
          const amountCommission = total * (commissionPercent / 100);
          const amountNetPayroll = total - amountCommission;

          if (isCanceled) {
            // Check if invoice exists in the database by invoice_uuid
            const { data: existingRecord, error: getErr } = await supabase
              .from('billing_records')
              .select('id, is_reconciled, bank_transaction_id')
              .eq('invoice_uuid', uuid)
              .maybeSingle();

            if (getErr) throw getErr;

            if (existingRecord) {
              // If it is reconciled, unlink the bank transaction first
              if (existingRecord.is_reconciled && existingRecord.bank_transaction_id) {
                const { error: bankErr } = await supabase
                  .from('bank_transactions')
                  .update({ is_reconciled: false })
                  .eq('id', existingRecord.bank_transaction_id);
                if (bankErr) throw bankErr;
              }

              // Update the existing invoice to be canceled and unreconciled
              const { error: updateErr } = await supabase
                .from('billing_records')
                .update({ 
                  is_canceled: true, 
                  is_reconciled: false, 
                  bank_transaction_id: null 
                })
                .eq('id', existingRecord.id);
              
              if (updateErr) throw updateErr;

              tempLogs.push({
                filename: file.name,
                type: 'warning',
                message: `Factura cancelada con éxito (existente en BD).`,
                uuid: uuid,
                amount: total,
                timestamp: new Date().toLocaleTimeString()
              });
              successCount++;
              continue; // Skip adding to parsedInvoices since we already updated it
            }
          }

          parsedInvoices.push({
            client_id: clientId,
            internal_company_id: internalCompanyId,
            invoice_uuid: uuid,
            is_invoiced: true,
            virtual_bucket_label: null,
            amount_gross: total,
            amount_commission: amountCommission,
            amount_net_payroll: amountNetPayroll,
            entry_type: 'payroll_funding',
            description: isIntercompany ? `${batchName} (Intercompañía)` : batchName,
            operation_date: operationDate,
            is_reconciled: false,
            is_canceled: isCanceled,
            imported_by: profile?.id || null
          });

          successCount++;
        }
      } catch (err: any) {
        console.error(`Error al procesar archivo ${file.name}:`, err);
        tempLogs.push({
          filename: file.name,
          type: 'error',
          message: err.message || 'Error de procesamiento XML',
          timestamp: new Date().toLocaleTimeString()
        });
      }

      parsedCount++;
      setUploadProgress(Math.round((parsedCount / totalFiles) * 100));
    }

    if (parsedInvoices.length === 0) {
      setIngestionLogs(tempLogs);
      showAlert('error', 'Error de Ingestión', 'No se pudo extraer ninguna factura válida de los archivos cargados. Revise el panel de reporte para ver los errores.');
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
        const { data: insertedRows, error: insertError } = await supabase
          .from('billing_records')
          .insert(uniqueParsedInvoices)
          .select('id');

        if (insertError) throw insertError;

        if (insertedRows && insertedRows.length > 0) {
          Promise.all(
            insertedRows.map(row =>
              ReconciliationService.processReconciliationEvent(row.id, 'billing_record')
                .catch(err => console.error(`Failed auto-reconciliation for bill ${row.id}:`, err))
            )
          ).then(() => {
            fetchBilling({
              sort: { column: 'created_at', direction: 'desc' }
            });
          });
        }
      }

      // Build report log objects
      parsedInvoices.forEach(inv => {
        const isDuplicate = existingUuids.has(inv.invoice_uuid);
        const fileName = uuidToFilenameMap.get(inv.invoice_uuid) || 'Factura';
        if (isDuplicate) {
          tempLogs.push({
            filename: fileName,
            type: 'error',
            message: `Factura duplicada. UUID ya registrado en el sistema.`,
            uuid: inv.invoice_uuid,
            amount: inv.amount_gross,
            timestamp: new Date().toLocaleTimeString()
          });
        } else {
          let successMessage = 'Cargada con éxito.';
          if (inv.virtual_bucket_label && inv.virtual_bucket_label.includes(':')) {
            const [parentUuid, numParcialidad] = inv.virtual_bucket_label.split(':');
            successMessage = `Pago (Parcialidad ${numParcialidad}) de Factura: ${parentUuid.slice(0, 8)}...${parentUuid.slice(-6)}`;
          }

          tempLogs.push({
            filename: fileName,
            type: inv.is_canceled ? 'warning' : 'success',
            message: inv.is_canceled ? 'Registrada como cancelada (nueva en BD).' : successMessage,
            uuid: inv.invoice_uuid,
            amount: inv.amount_gross,
            timestamp: new Date().toLocaleTimeString()
          });
        }
      });

      setIngestionLogs(tempLogs);

      let message = `Ingestión finalizada.\n`;
      message += `- Cargadas con éxito: ${uniqueParsedInvoices.length} facturas\n`;
      if (duplicatesCount > 0) {
        message += `- Omitidas por duplicadas: ${duplicatesCount}\n`;
      }
      const parsingErrorsCount = tempLogs.filter(l => l.type === 'error' && !l.message.includes('duplicada')).length;
      if (parsingErrorsCount > 0) {
        message += `- Errores de catálogo/formato (no guardados): ${parsingErrorsCount}\n`;
      }
      showAlert('success', 'Ingestión Completada', message);

      // Reload audit list
      fetchBilling({
        sort: { column: 'created_at', direction: 'desc' }
      });
    } catch (err: any) {
      console.error('Error al guardar facturas:', err);
      showAlert('error', 'Error al Guardar', `Error al guardar facturas: ${err.message}`);
      tempLogs.push({
        filename: 'Error general de base de datos',
        type: 'error',
        message: err.message || 'Error de conexión',
        timestamp: new Date().toLocaleTimeString()
      });
      setIngestionLogs(tempLogs);
    } finally {
      setIsUploading(false);
      setActiveUploadFile(null);
      setUploadProgress(0);
    }
  };  const handleClearVault = () => {
    showAlert(
      'confirm',
      'Limpiar Bóveda',
      '¿Está seguro de que desea limpiar la bóveda? Esto eliminará todas las facturas de la base de datos.',
      runClearVault
    );
  };

  const runClearVault = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('billing_records')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;
      
      showAlert('success', 'Bóveda Limpiada', 'Bóveda limpiada con éxito.');
      fetchBilling({
        sort: { column: 'created_at', direction: 'desc' }
      });
    } catch (err: any) {
      console.error('Error al limpiar la bóveda:', err);
      showAlert('error', 'Error al Limpiar', `Error al limpiar la bóveda: ${err.message}`);
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
        </div>
        <div className={styles.headerActions}>
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
              <div>
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
                <input 
                  type="file" 
                  id="canceled-upload-input"
                  className={styles.fileInput} 
                  multiple
                  onChange={handleCanceledInput}
                />
                <div className={styles.uploadIconCircle}>
                  <CloudUpload size={32} />
                </div>
                <p className={styles.dropTextPrimary}>Arrastre carpetas XML aquí</p>
                <p className={styles.dropTextSecondary}>Carga automática de carpetas de facturación (CFDI)</p>
                
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
                  <button 
                    type="button" 
                    className={styles.folderBtn}
                    onClick={() => document.getElementById('folder-upload-input')?.click()}
                  >
                    Seleccionar Carpeta
                  </button>
                  <button 
                    type="button" 
                    className={`${styles.folderBtn} ${styles.canceledBtn}`}
                    onClick={() => document.getElementById('canceled-upload-input')?.click()}
                  >
                    Cargar Canceladas (XMLs)
                  </button>
                  <button 
                    type="button" 
                    className={styles.clearBtn}
                    onClick={handleClearVault}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Limpiando...' : 'Limpiar Bóveda'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className={styles.cardFooter}>
            <div className={styles.stabilityBarTrack}>
              <div className={styles.stabilityBarFill}></div>
            </div>
          </div>
        </section>

        {/* Report Card Panel */}
        <section className={styles.reportCard}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <ClipboardList size={16} />
              Reporte de Alertas e Inconsistencias
            </h3>
            {ingestionLogs.length > 0 && (
              <span className={styles.tagBadge}>
                {ingestionLogs.length} Eventos
              </span>
            )}
          </div>

          {ingestionLogs.length === 0 ? (
            <div className={styles.reportEmpty}>
              <div className={styles.emptyIcon}>
                <ClipboardList size={48} strokeWidth={1.5} />
              </div>
              <h4 className={styles.emptyTextTitle}>Sin actividad en esta sesión</h4>
              <p className={styles.emptyTextSub}>
                Cargue una carpeta de facturas XML para ver los diagnósticos de validación, duplicados y alertas en tiempo real.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Badges */}
              <div className={styles.summaryBar}>
                <div className={`${styles.summaryBadge} ${styles.badgeSuccess}`}>
                  <span>{successLogsCount}</span>
                  <span>Exitosos</span>
                </div>
                <div className={`${styles.summaryBadge} ${styles.badgeError}`}>
                  <span>{errorLogsCount}</span>
                  <span>Errores</span>
                </div>
              </div>

              {/* Filters & Search */}
              <div className={styles.logFilterRow}>
                <div className={styles.logSearchWrapper}>
                  <Search size={14} className={styles.logSearchIcon} />
                  <input
                    type="text"
                    placeholder="Buscar por archivo, UUID o mensaje..."
                    className={styles.logSearchInput}
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                  />
                </div>

                <div className={styles.logFilterTabs}>
                  <button
                    type="button"
                    className={`${styles.logFilterTab} ${logActiveTab === 'ALL' ? styles.active : ''}`}
                    onClick={() => setLogActiveTab('ALL')}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    className={`${styles.logFilterTab} ${logActiveTab === 'SUCCESS' ? styles.active : ''}`}
                    onClick={() => setLogActiveTab('SUCCESS')}
                  >
                    Éxitos
                  </button>
                  <button
                    type="button"
                    className={`${styles.logFilterTab} ${logActiveTab === 'ERROR' ? styles.active : ''}`}
                    onClick={() => setLogActiveTab('ERROR')}
                  >
                    Errores
                  </button>
                </div>
              </div>

              {/* Scrollable logs list */}
              <div className={styles.logsList}>
                {filteredLogs.length === 0 ? (
                  <p style={{ textAlign: 'center', fontSize: '11px', color: '#64748b', padding: '16px 0' }}>
                    No se encontraron eventos con los filtros actuales
                  </p>
                ) : (
                  filteredLogs.map((log, index) => {
                    const isSuccess = log.type === 'success';

                    return (
                      <div
                        key={index}
                        className={`${styles.logItem} ${
                          isSuccess ? styles.itemSuccess : styles.itemError
                        }`}
                      >
                        <div
                          className={`${styles.logTypeIcon} ${
                            isSuccess ? styles.iconSuccess : styles.iconError
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 size={16} />
                          ) : (
                            <AlertCircle size={16} />
                          )}
                        </div>

                        <div className={styles.logDetails}>
                          <span className={styles.logFileName} title={log.filename}>
                            {log.filename}
                          </span>
                          <span className={styles.logMessage}>{log.message}</span>
                          <div className={styles.logMetaRow}>
                            <span>Hora: {log.timestamp}</span>
                            {log.uuid && (
                              <span style={{ fontFamily: 'monospace' }}>
                                UUID: ...{log.uuid.slice(-12)}
                              </span>
                            )}
                            {log.amount !== undefined && (
                              <span>
                                Monto: ${log.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </section>

      </div>

      {/* Audit Logs Table */}
      <section className={styles.logTableCard}>
        <div className={styles.logTableHeader}>
          <div className={styles.logTitleGroup}>
            <h3 className={styles.logTableTitle}>Historial de Ingestión</h3>
            <span className={styles.liveBadge}></span>
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

                      let isRepSplit = false;
                      let parentUuid = '';
                      let numParcialidad = '';
                      let fatherInvoiceExists = false;
                      let fatherInvoiceAmount = 0;

                      if (record.virtual_bucket_label && record.virtual_bucket_label.includes(':')) {
                        const parts = record.virtual_bucket_label.split(':');
                        parentUuid = parts[0];
                        numParcialidad = parts[1] || '1';
                        isRepSplit = true;

                        const fatherInv = billingRecords.find(
                          b => b.invoice_uuid?.toLowerCase() === parentUuid.toLowerCase()
                        );
                        if (fatherInv) {
                          fatherInvoiceExists = true;
                          fatherInvoiceAmount = fatherInv.amount_gross;
                        }
                      }

                      return (
                        <tr key={record.id}>
                          <td className={styles.uuidCell} title={record.invoice_uuid || 'Sin UUID'}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{record.invoice_uuid ? `${record.invoice_uuid.slice(0, 8)}...${record.invoice_uuid.slice(-6)}` : 'S/N'}</span>
                                {record.is_canceled && <span className={styles.canceledBadge}>Cancelada</span>}
                              </div>
                              {isRepSplit && (
                                <div className={`${styles.fatherBadge} ${fatherInvoiceExists ? styles.fatherFound : styles.fatherNotFound}`}>
                                  Parcialidad {numParcialidad} - {fatherInvoiceExists ? `Vinc: $${fatherInvoiceAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : 'No encontrada'}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className={styles.clientCell} title={recordClientName}>
                            <div className={styles.tableClientGroup}>
                              <span className={styles.tableClientName}>{recordClientName}</span>
                              {isRepSplit && (
                                <span className={styles.fatherInvoiceSub} title={parentUuid}>
                                  Factura Padre: {parentUuid.slice(0, 8)}...{parentUuid.slice(-6)}
                                </span>
                              )}
                              {!isRepSplit && recordClient?.legal_name && (
                                <span className={styles.tableClientSub}>{recordClient.legal_name}</span>
                              )}
                            </div>
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
      <ModalAlert 
        isOpen={modalConfig.isOpen}
        type={modalConfig.type}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
