import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useDatabase } from '../hooks/useDatabase';
import type { Client, ClientGroup, InternalCompany } from '../types';
import { 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  ChevronDown, 
  ChevronRight, 
  X, 
  Info, 
  ShieldAlert, 
  CheckCircle2, 
  Trash,
  TrendingUp
} from 'lucide-react';
import styles from './Clients.module.scss';

export const Clients = () => {
  const { profile, selectedCompanyId } = useAuth();
  const navigate = useNavigate();

  // Role Access Guard
  const isOwner = profile?.role === 'owner';

  // DB Hooks
  const { 
    data: clientGroups, 
    loading: loadingGroups, 
    fetchData: fetchGroups,
    createRecord: createGroup,
    deleteRecord: deleteGroup 
  } = useDatabase<ClientGroup>('client_groups');

  const { 
    data: clients, 
    loading: loadingClients, 
    fetchData: fetchClients,
    createRecord: createClient,
    updateRecord: updateClient,
    deleteRecord: deleteClient 
  } = useDatabase<Client>('clients');

  const { 
    data: companies, 
    fetchData: fetchCompanies 
  } = useDatabase<InternalCompany>('internal_companies');

  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  
  // Create Group Modal
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Side Drawer (Add/Edit Client)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [drawerParentGroup, setDrawerParentGroup] = useState<ClientGroup | null>(null);
  
  // Drawer form states
  const [formCommercialName, setFormCommercialName] = useState('');
  const [formLegalName, setFormLegalName] = useState('');
  const [formTaxId, setFormTaxId] = useState('');
  const [formCommission, setFormCommission] = useState('0.00');
  const [formCompanyId, setFormCompanyId] = useState('');

  // Dropdown active menus
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    if (isOwner) {
      fetchGroups();
      fetchClients();
      fetchCompanies();
    }
  }, [fetchGroups, fetchClients, fetchCompanies, isOwner]);

  // Expand first row by default if loaded
  useEffect(() => {
    if (clientGroups.length > 0 && Object.keys(expandedGroups).length === 0) {
      setExpandedGroups({ [clientGroups[0].id]: true });
    }
  }, [clientGroups, expandedGroups]);

  // Aggregate stats
  const totalAssets = useMemo(() => {
    return clients.reduce((sum, c) => sum + Number(c.retainer_balance || 0), 0);
  }, [clients]);

  // Filter clients and groups based on search
  const filteredGroupsWithClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      return clientGroups.map(group => ({
        ...group,
        subs: clients.filter(c => c.client_group_id === group.id)
      }));
    }

    return clientGroups.map(group => {
      const groupMatches = group.group_name.toLowerCase().includes(q);
      const subs = clients.filter(c => c.client_group_id === group.id && (
        c.name.toLowerCase().includes(q) ||
        (c.commercial_name && c.commercial_name.toLowerCase().includes(q)) ||
        (c.legal_name && c.legal_name.toLowerCase().includes(q)) ||
        (c.tax_id && c.tax_id.toLowerCase().includes(q))
      ));

      if (groupMatches || subs.length > 0) {
        return {
          ...group,
          subs: groupMatches ? clients.filter(c => c.client_group_id === group.id) : subs
        };
      }
      return null;
    }).filter(Boolean) as (ClientGroup & { subs: Client[] })[];
  }, [clientGroups, clients, searchQuery]);

  // Toggle Group Collapse
  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Create Group Handler
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      await createGroup({ group_name: newGroupName.trim() });
      setNewGroupName('');
      setIsGroupModalOpen(false);
      fetchGroups();
    } catch (err: any) {
      console.error('Error creating group:', err);
      alert('Error al crear el grupo: ' + err.message);
    }
  };

  // Delete Group Handler
  const handleDeleteGroup = async (group: ClientGroup) => {
    const hasSubs = clients.some(c => c.client_group_id === group.id);
    if (hasSubs) {
      alert('No se puede eliminar un grupo que contiene razones sociales activas. Elimine las razones sociales primero.');
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea eliminar el grupo "${group.group_name}"?`)) {
      return;
    }

    try {
      await deleteGroup(group.id);
      fetchGroups();
    } catch (err: any) {
      console.error('Error deleting group:', err);
      alert('Error al eliminar el grupo: ' + err.message);
    }
  };

  // Open Drawer for Add
  const handleOpenAddClient = (group: ClientGroup) => {
    setEditingClient(null);
    setDrawerParentGroup(group);
    
    setFormCommercialName('');
    setFormLegalName('');
    setFormTaxId('');
    setFormCommission('0.00');
    setFormCompanyId(selectedCompanyId || (companies[0]?.id || ''));
    
    setIsDrawerOpen(true);
    setActiveMenuId(null);
  };

  // Open Drawer for Edit
  const handleOpenEditClient = (client: Client, group: ClientGroup) => {
    setEditingClient(client);
    setDrawerParentGroup(group);
    
    setFormCommercialName(client.commercial_name || client.name || '');
    setFormLegalName(client.legal_name || '');
    setFormTaxId(client.tax_id || '');
    setFormCommission(Number(client.commission_percentage || 0).toFixed(2));
    setFormCompanyId(client.internal_company_id || (companies[0]?.id || ''));
    
    setIsDrawerOpen(true);
    setActiveMenuId(null);
  };

  // Save Client Handler
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerParentGroup) return;

    if (!formCommercialName.trim()) {
      alert('Por favor ingrese el Nombre Comercial.');
      return;
    }

    const payload: Partial<Client> = {
      name: formCommercialName.trim(),
      commercial_name: formCommercialName.trim(),
      legal_name: formLegalName.trim() || null,
      tax_id: formTaxId.trim().toUpperCase() || null,
      internal_company_id: formCompanyId,
      client_group_id: drawerParentGroup.id
    };

    const newPercentage = Number(formCommission);
    
    // Invisible Commission Control Panel checks
    if (editingClient) {
      const oldPercentage = Number(editingClient.commission_percentage || 0);
      if (newPercentage !== oldPercentage) {
        const confirmChange = window.confirm(
          `ALERTA DE SEGURIDAD: ¿Está seguro de que desea cambiar el porcentaje de comisión de ${oldPercentage.toFixed(2)}% a ${newPercentage.toFixed(2)}%?\n\nEsta actualización afectará inmediatamente los cálculos de comisiones para todas las transacciones futuras.`
        );
        if (!confirmChange) return;
      }
      payload.commission_percentage = newPercentage;

      try {
        await updateClient(editingClient.id, payload);
        alert('Razón social actualizada con éxito.');
        setIsDrawerOpen(false);
        fetchClients();
      } catch (err: any) {
        console.error('Error updating client:', err);
        alert('Error al guardar: ' + err.message);
      }
    } else {
      payload.commission_percentage = newPercentage;
      payload.retainer_balance = 0; // Initialize at 0

      try {
        await createClient(payload);
        alert('Nueva razón social registrada con éxito.');
        setIsDrawerOpen(false);
        fetchClients();
      } catch (err: any) {
        console.error('Error creating client:', err);
        alert('Error al registrar: ' + err.message);
      }
    }
  };

  // Delete Client Handler
  const handleDeleteClient = async (client: Client) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar la razón social "${client.name}"?\n\nEsta acción es irreversible.`)) {
      return;
    }

    try {
      await deleteClient(client.id);
      fetchClients();
    } catch (err: any) {
      console.error('Error deleting client:', err);
      alert('Error al eliminar la razón social: ' + err.message);
    }
  };

  // Access Wall Guard
  if (!isOwner) {
    return (
      <div className={styles.accessWall}>
        <div className={styles.wallCard}>
          <div className={styles.wallIcon}>
            <ShieldAlert size={48} />
          </div>
          <h2>Acceso Restringido</h2>
          <p>Este Directorio de Clientes contiene información sobre comisiones y cuentas bancarias.</p>
          <p className={styles.roleNotice}>Solo usuarios con el rol de <strong>Propietario (Owner)</strong> están autorizados a visualizar este panel.</p>
          <button className={styles.redirectBtn} onClick={() => navigate('/')}>
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Hero Header */}
      <div className={styles.heroSection}>
        <div className={styles.heroLeft}>
          <nav className={styles.breadcrumbs}>
            <span>Directorio</span>
            <span className={styles.separator}>/</span>
            <span className={styles.activeLink}>Grupos de Clientes</span>
          </nav>
          <h2 className={styles.title}>Clientes & Onboarding</h2>
          <p className={styles.subtitle}>Administre la jerarquía institucional y enlace las razones sociales con los grupos de clientes.</p>
        </div>
        <button 
          className={styles.primaryActionBtn} 
          onClick={() => setIsGroupModalOpen(true)}
        >
          <Plus size={16} />
          <span>Crear Grupo Cliente</span>
        </button>
      </div>

      {/* Bento Layout Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Activos en Garantía</p>
          <p className={styles.statValuePrimary}>
            ${totalAssets.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Grupos Activos</p>
          <p className={styles.statValue}>
            {clientGroups.length}
          </p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Revisiones de Cumplimiento</p>
          <p className={`${styles.statValue} ${styles.warning}`}>
            03
          </p>
        </div>
        <div className={styles.statCardInteractive}>
          <div className={styles.interactiveContent}>
            <TrendingUp size={20} className={styles.interactiveIcon} />
            <span>MÉTRICAS EN TIEMPO REAL</span>
          </div>
        </div>
      </div>

      {/* Nested Data Table Section */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h3>Directorio Maestro</h3>
          <div className={styles.headerFilters}>
            <div className={styles.searchWrapper}>
              <Search size={14} className={styles.searchIcon} />
              <input 
                type="text" 
                placeholder="Buscar RFC, Empresa o Grupo..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            <button className={styles.filterBtn}>
              <Filter size={14} />
              <span>Filtrar</span>
            </button>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.directoryTable}>
            <thead>
              <tr>
                <th>Jerarquía de Entidad</th>
                <th>Estado</th>
                <th>Sub-empresas Activas</th>
                <th className={styles.alignRight}>Fondo Acumulado</th>
                <th style={{ width: '60px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loadingGroups || loadingClients ? (
                <tr>
                  <td colSpan={5} className={styles.tableLoading}>
                    <span>Cargando directorio...</span>
                  </td>
                </tr>
              ) : filteredGroupsWithClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.tableEmpty}>
                    <span>No se encontraron grupos de clientes o empresas que coincidan.</span>
                  </td>
                </tr>
              ) : (
                filteredGroupsWithClients.map(group => {
                  const isExpanded = !!expandedGroups[group.id];
                  const groupBalance = group.subs.reduce((sum, c) => sum + Number(c.retainer_balance || 0), 0);
                  const isMenuOpen = activeMenuId === group.id;

                  return (
                    <tr key={group.id} className={styles.parentRowWrapper}>
                      <td colSpan={5} className={styles.parentRowContainer}>
                        {/* Parent Row */}
                        <div 
                          className={styles.parentRow}
                          onClick={() => toggleGroup(group.id)}
                        >
                          <div className={styles.parentTitleGroup}>
                            {isExpanded ? (
                              <ChevronDown size={18} className={styles.expandIcon} />
                            ) : (
                              <ChevronRight size={18} className={styles.expandIcon} />
                            )}
                            <span className={styles.groupName}>{group.group_name}</span>
                          </div>
                          <div className={styles.parentStatus}>
                            <span className={styles.verifiedBadge}>Verificado</span>
                          </div>
                          <div className={styles.parentSubsCount}>
                            {group.subs.length} {group.subs.length === 1 ? 'Razón Social' : 'Razones Sociales'}
                          </div>
                          <div className={`${styles.parentBalance} ${styles.alignRight}`}>
                            ${groupBalance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div 
                            className={styles.parentActions}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(isMenuOpen ? null : group.id);
                            }}
                          >
                            <MoreVertical size={16} />
                            {isMenuOpen && (
                              <div className={styles.contextDropdown}>
                                <button onClick={() => handleOpenAddClient(group)}>
                                  <Plus size={12} />
                                  <span>Agregar Razón Social</span>
                                </button>
                                <button onClick={() => handleDeleteGroup(group)} className={styles.dangerAction}>
                                  <Trash size={12} />
                                  <span>Eliminar Grupo</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Nested Child Table */}
                        {isExpanded && (
                          <div className={styles.childTableContainer}>
                            {group.subs.length === 0 ? (
                              <div className={styles.noChildren}>
                                <span>No hay razones sociales enlazadas. Haga clic en el menú del grupo para agregar una.</span>
                              </div>
                            ) : (
                              <table className={styles.childTable}>
                                <thead>
                                  <tr>
                                    <th>Nombre Comercial</th>
                                    <th>RFC / Razón Social</th>
                                    <th>Comisión (%)</th>
                                    <th className={styles.alignRight}>Fondo de Garantía</th>
                                    <th style={{ width: '80px' }}>Acción</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.subs.map(client => (
                                    <tr key={client.id} className={styles.childRow}>
                                      <td className={styles.childName}>{client.name}</td>
                                      <td>
                                        <div className={styles.rfcGroup}>
                                          <span className={styles.rfcCode}>{client.tax_id || 'SIN RFC'}</span>
                                          {client.legal_name && (
                                            <span className={styles.legalName}>{client.legal_name}</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className={styles.commissionVal}>
                                        {Number(client.commission_percentage || 0).toFixed(2)}%
                                      </td>
                                      <td className={`${styles.retainerVal} ${styles.alignRight}`}>
                                        ${Number(client.retainer_balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </td>
                                      <td className={styles.childActions}>
                                        <button 
                                          className={styles.editBtn}
                                          onClick={() => handleOpenEditClient(client, group)}
                                        >
                                          EDITAR
                                        </button>
                                        <button 
                                          className={styles.deleteSubBtn}
                                          onClick={() => handleDeleteClient(client)}
                                        >
                                          <Trash size={12} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Group Modal */}
      {isGroupModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Crear Nuevo Grupo de Clientes</h3>
              <button onClick={() => setIsGroupModalOpen(false)} className={styles.closeModalBtn}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateGroup} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label>Nombre Identificador Maestro (Dueño / Grupo)</label>
                <input 
                  type="text" 
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Ej. ELIAS, CAROLINA..." 
                  className={styles.modalInput}
                  required
                  autoFocus
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setIsGroupModalOpen(false)} className={styles.cancelBtn}>
                  Cancelar
                </button>
                <button type="submit" className={styles.submitBtn}>
                  Guardar Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-Drawer UI Overlay */}
      {isDrawerOpen && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setIsDrawerOpen(false)} />
          <div className={styles.sideDrawer}>
            <div className={styles.drawerHeader}>
              <div>
                <h2>{editingClient ? 'Modificar Razón Social' : 'Agregar Razón Social'}</h2>
                <p>Grupo: {drawerParentGroup?.group_name}</p>
              </div>
              <button className={styles.closeDrawerBtn} onClick={() => setIsDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveClient} className={styles.drawerForm}>
              <div className={styles.drawerBody}>
                <div className={styles.formItem}>
                  <label>Nombre Comercial</label>
                  <input 
                    type="text" 
                    value={formCommercialName}
                    onChange={(e) => setFormCommercialName(e.target.value)}
                    placeholder="Ej. Omega Logistics" 
                    className={styles.drawerInput}
                    required
                  />
                </div>

                <div className={styles.formItem}>
                  <label>Razón Social (Legal)</label>
                  <input 
                    type="text" 
                    value={formLegalName}
                    onChange={(e) => setFormLegalName(e.target.value)}
                    placeholder="Ej. Omega Logistics S.A. de C.V." 
                    className={styles.drawerInput}
                  />
                </div>

                <div className={styles.formItem}>
                  <label>RFC / ID Fiscal</label>
                  <input 
                    type="text" 
                    value={formTaxId}
                    onChange={(e) => setFormTaxId(e.target.value)}
                    placeholder="Ej. OLO980312TR3" 
                    className={styles.drawerInput}
                  />
                </div>

                <div className={styles.gridFormRow}>
                  <div className={styles.formItem}>
                    <label>Porcentaje Comisión</label>
                    <div className={styles.inputWithUnit}>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0"
                        max="100"
                        value={formCommission}
                        onChange={(e) => setFormCommission(e.target.value)}
                        placeholder="0.00" 
                        className={styles.drawerInput}
                        required
                      />
                      <span className={styles.unit}>%</span>
                    </div>
                  </div>

                  <div className={styles.formItem}>
                    <label>Cuenta Destino (Interna)</label>
                    <select
                      value={formCompanyId}
                      onChange={(e) => setFormCompanyId(e.target.value)}
                      className={styles.drawerSelect}
                      required
                    >
                      {companies.map(comp => (
                        <option key={comp.id} value={comp.id}>
                          {comp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.securityNoteCard}>
                  <h4 className={styles.noteTitle}>
                    <Info size={14} />
                    <span>NOTA DE SEGURIDAD</span>
                  </h4>
                  <p className={styles.noteContent}>
                    Los cambios en comisiones y razones fiscales de clientes quedan registrados en la bitácora de auditoría vinculada a su UID de operador.
                  </p>
                </div>

                <div className={styles.securityEncryptionBanner}>
                  <span className={styles.bannerText}>CANAL DE TRANSACCIÓN ENCRIPTADO</span>
                </div>
              </div>

              <div className={styles.drawerFooter}>
                <button type="button" className={styles.discardBtn} onClick={() => setIsDrawerOpen(false)}>
                  Descartar
                </button>
                <button type="submit" className={styles.saveBtn}>
                  <CheckCircle2 size={16} />
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
