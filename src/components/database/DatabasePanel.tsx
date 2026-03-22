import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { ChevronDown, ChevronRight, Database, Table, Eye, Filter } from 'lucide-react';

type DbKind = 'my_sql' | 'pg_sql' | 'sqlite' | 'mongo_db' | 'redis' | 'h2_pg';

type DbConnectionConfig = {
  id: string;
  name: string;
  kind: DbKind;
  url: string;
  tags?: string[];
};

type DbTableInfo = {
  name: string;
  schema?: string | null;
};

type DbColumnInfo = {
  name: string;
  data_type?: string | null;
  nullable?: boolean | null;
};

export default function DatabasePanel({ rootPath }: { rootPath: string }) {
  const [connections, setConnections] = useState<DbConnectionConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(new Set()); // connectionId-database
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set()); // connectionId-database-table
  const [selectedDatabases, setSelectedDatabases] = useState<Set<string>>(new Set()); // connectionId-database

  console.log('DatabasePanel render', { rootPath, connectionsCount: connections.length, selectedId });

  const selected = useMemo(() => connections.find((c) => c.id === selectedId) ?? null, [connections, selectedId]);

  const [newKind, setNewKind] = useState<DbKind>('sqlite');
  const [newUrl, setNewUrl] = useState('');
  const [useAdvanced, setUseAdvanced] = useState(false);

  // Form fields for structured connection
  const [formHost, setFormHost] = useState('localhost');
  const [formPort, setFormPort] = useState('3306');
  const [formUser, setFormUser] = useState('root');
  const [formPassword, setFormPassword] = useState('');
  const [formDatabase, setFormDatabase] = useState('');
  const [formFile, setFormFile] = useState('');

  const [activeTable, setActiveTable] = useState<DbTableInfo | null>(null);
  const [columns, setColumns] = useState<DbColumnInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showDatabaseSelector, setShowDatabaseSelector] = useState<string | null>(null);
  
  // Store data per connection
  const [connectionData, setConnectionData] = useState<Map<string, {
    databases: string[];
    databaseTables: Map<string, DbTableInfo[]>; // database -> tables
    selectedDatabases: Set<string>;
  }>>(new Map());

  // Load data for sections
  const loadTablesForDatabase = useCallback(async (connectionId: string, database: string) => {
    try {
      // For MySQL, we need to switch to the specific database first
      const tables = (await invoke('db_list_tables', { id: connectionId })) as DbTableInfo[];
      setConnectionData(prev => {
        const next = new Map(prev);
        const existing = next.get(connectionId) || { databases: [], databaseTables: new Map(), selectedDatabases: new Set() };
        const newTables = new Map(existing.databaseTables);
        newTables.set(database, Array.isArray(tables) ? tables : []);
        next.set(connectionId, { ...existing, databaseTables: newTables });
        return next;
      });
    } catch {
      setConnectionData(prev => {
        const next = new Map(prev);
        const existing = next.get(connectionId) || { databases: [], databaseTables: new Map(), selectedDatabases: new Set() };
        const newTables = new Map(existing.databaseTables);
        newTables.set(database, []);
        next.set(connectionId, { ...existing, databaseTables: newTables });
        return next;
      });
    }
  }, []);

  const loadDatabases = useCallback(async (connectionId: string) => {
    try {
      console.log('Loading databases for connection:', connectionId);
      const dbs = (await invoke('db_list_databases', { id: connectionId })) as string[];
      console.log('Databases loaded:', dbs);
      setConnectionData(prev => {
        const next = new Map(prev);
        const existing = next.get(connectionId) || { databases: [], databaseTables: new Map(), selectedDatabases: new Set() };
        next.set(connectionId, { ...existing, databases: Array.isArray(dbs) ? dbs : [] });
        return next;
      });
    } catch (e: any) {
      console.error('Failed to load databases:', e);
      setError(`Failed to load databases: ${String(e)}`);
      setConnectionData(prev => {
        const next = new Map(prev);
        const existing = next.get(connectionId) || { databases: [], databaseTables: new Map(), selectedDatabases: new Set() };
        next.set(connectionId, { ...existing, databases: [] });
        return next;
      });
    }
  }, []);

  // Toggle connection expansion
  const toggleConnection = useCallback((connectionId: string) => {
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(connectionId)) {
        next.delete(connectionId);
        // Clear expanded databases and tables when collapsing
        setExpandedDatabases(new Set());
        setExpandedTables(new Set());
      } else {
        next.add(connectionId);
        // Auto-load databases when expanding connection
        void loadDatabases(connectionId);
      }
      return next;
    });
  }, [loadDatabases]);

  // Toggle database expansion
  const toggleDatabase = useCallback((connectionId: string, database: string) => {
    const key = `${connectionId}-${database}`;
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Clear expanded tables for this database
        setExpandedTables((prevTables) => {
          const nextTables = new Set(prevTables);
          Array.from(prevTables).forEach(tableKey => {
            if (tableKey.startsWith(`${connectionId}-${database}-`)) {
              nextTables.delete(tableKey);
            }
          });
          return nextTables;
        });
      } else {
        next.add(key);
        // Load tables for this database
        void loadTablesForDatabase(connectionId, database);
      }
      return next;
    });
  }, [loadTablesForDatabase]);

  // Toggle table expansion
  const toggleTable = useCallback((connectionId: string, database: string, table: string) => {
    const key = `${connectionId}-${database}-${table}`;
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Toggle database selection
  const toggleDatabaseSelection = useCallback((connectionId: string, database: string) => {
    const key = `${connectionId}-${database}`;
    setSelectedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Open table data in editor
  const openTableData = useCallback((connectionId: string, database: string, table: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('gopilot:openTableData', {
        detail: {
          connectionId,
          database,
          table,
          title: `${database}.${table}`,
        },
      }),
    );
  }, []);

  const defaultName = useMemo(() => {
    const prefix =
      newKind === 'my_sql'
        ? 'mysql'
        : newKind === 'pg_sql'
          ? 'pgsql'
          : newKind === 'sqlite'
            ? 'sqlite'
            : newKind === 'mongo_db'
              ? 'mongodb'
              : newKind === 'redis'
                ? 'redis'
                : 'h2';

    const existing = connections.filter((c) => c.kind === newKind);
    const n = existing.length + 1;
    return `${prefix}_${n}`;
  }, [connections, newKind]);

  // Auto-generate URL from form fields
  const generatedUrl = useMemo(() => {
    if (useAdvanced) return newUrl;
    switch (newKind) {
      case 'my_sql':
        return `mysql://${formUser}:${formPassword}@${formHost}:${formPort}/${formDatabase}`;
      case 'pg_sql':
      case 'h2_pg':
        return `postgresql://${formUser}:${formPassword}@${formHost}:${formPort}/${formDatabase}`;
      case 'sqlite':
        return formFile ? `sqlite:${formFile}` : 'sqlite:';
      case 'mongo_db':
        return `mongodb://${formUser}:${formPassword}@${formHost}:${formPort}/${formDatabase}`;
      case 'redis':
        return `redis://${formPassword ? `:${formPassword}@` : ''}${formHost}:${formPort}/${formDatabase}`;
      default:
        return '';
    }
  }, [useAdvanced, newUrl, newKind, formHost, formPort, formUser, formPassword, formDatabase, formFile]);

  // Update port default when kind changes
  useEffect(() => {
    const defaults: Record<DbKind, string> = {
      my_sql: '3306',
      pg_sql: '5432',
      sqlite: '',
      h2_pg: '9092',
      mongo_db: '27017',
      redis: '6379',
    };
    setFormPort(defaults[newKind]);
    setFormUser(newKind === 'sqlite' ? '' : 'root');
    setFormPassword('');
    setFormDatabase('');
    setFormFile('');
  }, [newKind]);

  const refreshConnections = useCallback(async () => {
    const list = (await invoke('db_list_connections')) as DbConnectionConfig[];
    setConnections(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        if (rootPath) {
          await invoke('db_load_connections', { rootPath });
        }
      } catch {
        // ignore
      }
      await refreshConnections();
    })();
  }, [refreshConnections, rootPath]);

  useEffect(() => {
    if (!selectedId) {
      setActiveTable(null);
      setColumns([]);
      return;
    }
  }, [selectedId]);

  useEffect(() => {
    if (!activeTable || !selectedId) {
      setColumns([]);
      return;
    }
    void (async () => {
      try {
        const cols = (await invoke('db_list_columns', {
          id: selectedId,
          schema: null,
          table: activeTable.name,
        })) as DbColumnInfo[];
        setColumns(Array.isArray(cols) ? cols : []);
      } catch {
        setColumns([]);
      }
    })();
  }, [activeTable, selectedId]);

  const onAdd = useCallback(async () => {
    console.log('onAdd clicked', { rootPath, defaultName, newKind, generatedUrl });
    setError('');
    setBusy(true);
    try {
      if (rootPath) {
        // Save to project if we have a project
        await invoke('db_add_connection_for_project', {
          rootPath,
          req: {
            name: defaultName,
            kind: newKind,
            url: generatedUrl,
            tags: [],
          },
        });
      } else {
        // Save globally if no project
        await invoke('db_add_connection', {
          req: {
            name: defaultName,
            kind: newKind,
            url: generatedUrl,
            tags: [],
          },
        });
      }
      console.log('Connection added successfully');
      setNewUrl('');
      setFormHost('localhost');
      setFormPort('3306');
      setFormUser('root');
      setFormPassword('');
      setFormDatabase('');
      setFormFile('');
      await refreshConnections();
    } catch (e: any) {
      console.error('Add connection error:', e);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [defaultName, generatedUrl, newKind, refreshConnections, rootPath]);

  const onRemove = useCallback(async () => {
    if (!selectedId) return;
    setError('');
    setBusy(true);
    try {
      if (rootPath) {
        await invoke('db_remove_connection_for_project', { rootPath, id: selectedId });
      } else {
        await invoke('db_remove_connection', { id: selectedId });
      }
      setSelectedId('');
      await refreshConnections();
    } catch (e: any) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [refreshConnections, rootPath, selectedId]);

  const onTest = useCallback(async () => {
    console.log('onTest clicked', { selectedId });
    if (!selectedId) return;
    setError('');
    setBusy(true);
    try {
      const res = (await invoke('db_test_connection', { id: selectedId })) as any;
      console.log('Test result:', res);
      setError(res?.ok ? String(res?.message ?? 'OK') : String(res?.message ?? 'Failed'));
    } catch (e: any) {
      console.error('Test connection error:', e);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [selectedId]);

  const onOpenConsole = useCallback(() => {
    console.log('onOpenConsole clicked', { selected });
    if (!selected) return;
    try {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(
        new CustomEvent('gopilot:openSqlConsole', {
          detail: {
            connectionId: selected.id,
            title: selected.name,
          },
        }),
      );
      console.log('SQL Console event dispatched');
    } catch (e: any) {
      console.error('Open console error:', e);
    }
  }, [selected]);

  return (
    <div className="h-full flex flex-col min-w-0">
      <div className="p-3 border-b border-gray-200 flex-shrink-0">
        <div className="text-sm font-medium text-gray-800">Data Sources</div>

        <div className="mt-2 grid grid-cols-1 gap-2">
          <select className="border border-gray-200 rounded px-2 py-1 text-sm" value={newKind} onChange={(e) => setNewKind(e.target.value as DbKind)}>
            <option value="sqlite">SQLite</option>
            <option value="my_sql">MySQL</option>
            <option value="pg_sql">PostgreSQL</option>
            <option value="h2_pg">H2 (Pg Mode)</option>
            <option value="mongo_db">MongoDB</option>
            <option value="redis">Redis</option>
          </select>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="advanced"
              checked={useAdvanced}
              onChange={(e) => setUseAdvanced(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="advanced" className="text-xs text-gray-600">Advanced (direct URL)</label>
          </div>

          {useAdvanced ? (
            <input
              className="border border-gray-200 rounded px-2 py-1 text-sm font-mono"
              placeholder="mysql://user:pass@host:port/db"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
          ) : (
            <>
              {(newKind === 'sqlite') ? (
                <input
                  className="border border-gray-200 rounded px-2 py-1 text-sm"
                  placeholder="Database file path (optional)"
                  value={formFile}
                  onChange={(e) => setFormFile(e.target.value)}
                />
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="border border-gray-200 rounded px-2 py-1 text-sm"
                      placeholder="Host"
                      value={formHost}
                      onChange={(e) => setFormHost(e.target.value)}
                    />
                    <input
                      className="border border-gray-200 rounded px-2 py-1 text-sm"
                      placeholder="Port"
                      value={formPort}
                      onChange={(e) => setFormPort(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="border border-gray-200 rounded px-2 py-1 text-sm"
                      placeholder="User"
                      value={formUser}
                      onChange={(e) => setFormUser(e.target.value)}
                    />
                    <input
                      className="border border-gray-200 rounded px-2 py-1 text-sm"
                      type="password"
                      placeholder="Password"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                    />
                  </div>
                  <input
                    className="border border-gray-200 rounded px-2 py-1 text-sm"
                    placeholder="Database (optional)"
                    value={formDatabase}
                    onChange={(e) => setFormDatabase(e.target.value)}
                  />
                </>
              )}

              <div className="text-xs text-gray-500 font-mono bg-gray-50 rounded px-2 py-1 break-all">
                {generatedUrl || 'URL will appear here...'}
              </div>
            </>
          )}

          <button
            type="button"
            className="text-sm px-3 py-2 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
            disabled={busy || (!useAdvanced && !generatedUrl) || (useAdvanced && !newUrl)}
            onClick={onAdd}
          >
            Add
          </button>
        </div>

        <div className="mt-3 flex gap-2 flex-wrap">
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
            onClick={() => {
              console.log('Test button clicked!');
              alert('Button click works!');
            }}
          >
            Test Click
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
            disabled={busy || !selectedId}
            onClick={onOpenConsole}
          >
            Open Console
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
            disabled={busy || !selectedId}
            onClick={onTest}
          >
            Test
          </button>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
            disabled={busy || !selectedId}
            onClick={onRemove}
          >
            Remove
          </button>
        </div>

        {error ? <div className="mt-2 text-xs text-red-600 whitespace-pre-wrap">{error}</div> : null}
      </div>

      <div className="flex-1 min-h-0 flex flex-col min-w-0">
        <div className="flex-1 overflow-auto min-w-0">
          {connections.length === 0 ? <div className="p-3 text-xs text-gray-500">No connections</div> : null}
          {connections.map((c) => {
            const data = connectionData.get(c.id) || { databases: [], databaseTables: new Map(), selectedDatabases: new Set() };
            return (
              <div key={c.id} className="border-b border-gray-100">
                <div className="flex items-center px-3 py-2 hover:bg-gray-50">
                  <button
                    type="button"
                    className="w-4 h-4 mr-2 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
                    onClick={() => toggleConnection(c.id)}
                  >
                    {expandedConnections.has(c.id) ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                  
                  <div
                    className={`flex-1 text-xs cursor-pointer min-w-0 ${selectedId === c.id ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <div className="truncate">{c.name}</div>
                    <div className="text-gray-400 text-xs">{c.kind}</div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      className="p-1 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowDatabaseSelector(showDatabaseSelector === c.id ? null : c.id)}
                    >
                      <Filter className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Database selector popup */}
                {showDatabaseSelector === c.id && (
                  <div className="absolute z-10 mt-1 ml-8 bg-white border border-gray-200 rounded shadow-lg">
                    <div className="p-2">
                      <div className="text-xs font-medium text-gray-700 mb-2">Select Databases:</div>
                      {data.databases.length === 0 ? (
                        <div className="text-xs text-gray-400 p-2">No databases available</div>
                      ) : (
                        <div className="max-h-32 overflow-y-auto">
                          {data.databases.map((db: string) => {
                            const dbKey = `${c.id}-${db}`;
                            const isSelected = selectedDatabases.has(dbKey);
                            return (
                              <label key={db} className="flex items-center text-xs hover:bg-gray-100 rounded p-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="mr-2 rounded"
                                  checked={isSelected}
                                  onChange={() => toggleDatabaseSelection(c.id, db)}
                                />
                                {db}
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <button
                          type="button"
                          className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                          onClick={() => {
                            // Expand selected databases
                            selectedDatabases.forEach(dbKey => {
                              const [connId, dbName] = dbKey.split('-', 2);
                              if (connId === c.id) {
                                toggleDatabase(connId, dbName);
                              }
                            });
                            setShowDatabaseSelector(null);
                          }}
                        >
                          Expand Selected
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Expanded content - Databases */}
                {expandedConnections.has(c.id) && (
                  <div className="bg-gray-50 border-t border-gray-200">
                    {data.databases.length === 0 ? (
                      <div className="px-6 py-2 text-xs text-gray-400">No databases found</div>
                    ) : (
                      data.databases.map((database) => {
                        const dbKey = `${c.id}-${database}`;
                        const isExpanded = expandedDatabases.has(dbKey);
                        const tables = data.databaseTables.get(database) || [];
                        
                        return (
                          <div key={database} className="border-b border-gray-100 last:border-b-0">
                            <div className="flex items-center px-6 py-1 hover:bg-gray-100">
                              <button
                                type="button"
                                className="w-3 h-3 mr-2 flex items-center justify-center text-gray-400 hover:text-gray-600"
                                onClick={() => toggleDatabase(c.id, database)}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-2 h-2" />
                                ) : (
                                  <ChevronRight className="w-2 h-2" />
                                )}
                              </button>
                              <span className="text-xs text-gray-700 flex-1 flex items-center">
                                <Database className="w-3 h-3 mr-1" />
                                {database}
                              </span>
                              <input
                                type="checkbox"
                                className="rounded"
                                checked={selectedDatabases.has(dbKey)}
                                onChange={() => toggleDatabaseSelection(c.id, database)}
                              />
                            </div>

                            {/* Tables */}
                            {isExpanded && (
                              <div className="bg-gray-100">
                                {tables.length === 0 ? (
                                  <div className="px-8 py-1 text-xs text-gray-400">No tables</div>
                                ) : (
                                  tables.map((table: DbTableInfo) => {
                                    const tableKey = `${c.id}-${database}-${table.name}`;
                                    const isTableExpanded = expandedTables.has(tableKey);
                                    
                                    return (
                                      <div key={tableKey} className="border-b border-gray-200 last:border-b-0">
                                        <div className="flex items-center px-8 py-1 hover:bg-gray-50">
                                          <button
                                            type="button"
                                            className="w-3 h-3 mr-2 flex items-center justify-center text-gray-400 hover:text-gray-600"
                                            onClick={() => toggleTable(c.id, database, table.name)}
                                          >
                                            {isTableExpanded ? (
                                              <ChevronDown className="w-2 h-2" />
                                            ) : (
                                              <ChevronRight className="w-2 h-2" />
                                            )}
                                          </button>
                                          <span className="text-xs text-gray-600 flex-1 flex items-center">
                                            <Table className="w-3 h-3 mr-1" />
                                            {table.name}
                                          </span>
                                          <button
                                            type="button"
                                            className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 flex items-center"
                                            onClick={() => openTableData(c.id, database, table.name)}
                                          >
                                            <Eye className="w-3 h-3 mr-1" />
                                            View Data
                                          </button>
                                        </div>

                                        {/* Columns */}
                                        {isTableExpanded && (
                                          <div className="bg-white ml-4 mr-2 mb-1 rounded border border-gray-200">
                                            <div className="px-2 py-1 text-xs font-medium text-gray-600 border-b border-gray-200">
                                              Columns
                                            </div>
                                            {columns.length === 0 ? (
                                              <div className="px-2 py-1 text-xs text-gray-400">Loading columns...</div>
                                            ) : (
                                              columns.map((col) => (
                                                <div key={col.name} className="px-2 py-1 text-xs text-gray-500 border-b border-gray-100 last:border-b-0">
                                                  <span className="font-medium text-gray-600">{col.name}</span>
                                                  {col.data_type && (
                                                    <span className="text-gray-400 ml-1">({col.data_type})</span>
                                                  )}
                                                  {col.nullable !== undefined && (
                                                    <span className="text-gray-400 ml-1 text-xs">
                                                      [{col.nullable ? 'NULL' : 'NOT NULL'}]
                                                    </span>
                                                  )}
                                                </div>
                                              ))
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
