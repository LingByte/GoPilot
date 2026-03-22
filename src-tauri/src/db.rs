use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DbKind {
    MySql,
    PgSql,
    Sqlite,
    MongoDb,
    Redis,
    /// H2 does not have a native Rust driver.
    /// Use H2 started in PostgreSQL-compatible mode and connect via Postgres protocol.
    H2Pg,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbQueryOptions {
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
    #[serde(default)]
    pub params: Option<Vec<serde_json::Value>>,
}

fn connections_store_path(root_path: &str) -> Result<String, String> {
    if root_path.trim().is_empty() {
        return Err("root_path is required".to_string());
    }
    Ok(format!("{}\\.pilot\\db_connections.json", root_path.trim_end_matches(['\\', '/'])))
}

fn ensure_parent_dir(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    let Some(parent) = p.parent() else {
        return Ok(());
    };
    fs::create_dir_all(parent).map_err(|e| e.to_string())
}

fn save_connections_to_path(path: &str, conns: &[DbConnectionConfig]) -> Result<(), String> {
    ensure_parent_dir(path)?;
    let data = serde_json::to_string_pretty(conns).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

fn load_connections_from_path(path: &str) -> Result<Vec<DbConnectionConfig>, String> {
    if !Path::new(path).exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if raw.trim().is_empty() {
        return Ok(vec![]);
    }
    let parsed = serde_json::from_str::<Vec<DbConnectionConfig>>(&raw).map_err(|e| e.to_string())?;
    Ok(parsed)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbConnectionConfig {
    pub id: String,
    pub name: String,
    pub kind: DbKind,

    /// Connection URL/DSN.
    ///
    /// Examples:
    /// - MySQL: mysql://user:pass@host:3306/db
    /// - Postgres: postgres://user:pass@host:5432/db
    /// - SQLite: sqlite:C:/path/to/db.sqlite or sqlite://C:/path/to/db.sqlite
    /// - MongoDB: mongodb://user:pass@host:27017/db
    /// - Redis: redis://:pass@host:6379/0
    pub url: String,

    /// Optional label metadata (not used by the backend logic yet).
    #[serde(default)]
    pub tags: Vec<String>,
}

impl DbConnectionConfig {
    pub fn sanitized(&self) -> Self {
        // For now we just return the same url (it may contain credentials).
        // UI should mask it when displaying. We keep this hook to improve later.
        self.clone()
    }
}

#[derive(Default)]
pub struct DbRegistry {
    conns: Arc<Mutex<HashMap<String, DbConnectionConfig>>>,
}

impl DbRegistry {
    pub fn upsert(&self, cfg: DbConnectionConfig) {
        self.conns.lock().unwrap().insert(cfg.id.clone(), cfg);
    }

    pub fn clear(&self) {
        self.conns.lock().unwrap().clear();
    }

    pub fn remove(&self, id: &str) -> bool {
        self.conns.lock().unwrap().remove(id).is_some()
    }

    pub fn list(&self) -> Vec<DbConnectionConfig> {
        let mut v: Vec<DbConnectionConfig> = self
            .conns
            .lock()
            .unwrap()
            .values()
            .cloned()
            .map(|c| c.sanitized())
            .collect();
        v.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        v
    }

    pub fn get(&self, id: &str) -> Option<DbConnectionConfig> {
        self.conns.lock().unwrap().get(id).cloned()
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbAddConnectionRequest {
    pub name: String,
    pub kind: DbKind,
    pub url: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbUpdateConnectionRequest {
    pub id: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbTestResult {
    pub ok: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub rows_affected: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbTableInfo {
    pub name: String,
    #[serde(default)]
    pub schema: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DbColumnInfo {
    pub name: String,
    #[serde(default)]
    pub data_type: Option<String>,
    #[serde(default)]
    pub nullable: Option<bool>,
}

fn new_id() -> String {
    // Avoid pulling in uuid crate right now.
    // Good enough for a local registry (can be replaced later).
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("db_{}", ts)
}

#[tauri::command]
pub async fn db_add_connection(
    req: DbAddConnectionRequest,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<DbConnectionConfig, String> {
    if req.name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    if req.url.trim().is_empty() {
        return Err("url is required".to_string());
    }

    let cfg = DbConnectionConfig {
        id: new_id(),
        name: req.name,
        kind: req.kind,
        url: req.url,
        tags: req.tags,
    };

    registry.upsert(cfg.clone());
    Ok(cfg.sanitized())
}

#[tauri::command]
pub async fn db_add_connection_for_project(
    root_path: String,
    req: DbAddConnectionRequest,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<DbConnectionConfig, String> {
    if req.name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    if req.url.trim().is_empty() {
        return Err("url is required".to_string());
    }

    let cfg = DbConnectionConfig {
        id: new_id(),
        name: req.name,
        kind: req.kind,
        url: req.url,
        tags: req.tags,
    };
    registry.upsert(cfg.clone());

    let _ = db_save_connections(root_path, registry).await;
    Ok(cfg.sanitized())
}

#[tauri::command]
pub async fn db_update_connection(
    req: DbUpdateConnectionRequest,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<DbConnectionConfig, String> {
    if req.id.trim().is_empty() {
        return Err("id is required".to_string());
    }
    let Some(mut cfg) = registry.get(&req.id) else {
        return Err("connection not found".to_string());
    };

    if let Some(name) = req.name {
        if name.trim().is_empty() {
            return Err("name is required".to_string());
        }
        cfg.name = name;
    }

    if let Some(url) = req.url {
        if url.trim().is_empty() {
            return Err("url is required".to_string());
        }
        cfg.url = url;
    }

    if let Some(tags) = req.tags {
        cfg.tags = tags;
    }

    registry.upsert(cfg.clone());
    Ok(cfg.sanitized())
}

#[tauri::command]
pub async fn db_update_connection_for_project(
    root_path: String,
    req: DbUpdateConnectionRequest,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<DbConnectionConfig, String> {
    if req.id.trim().is_empty() {
        return Err("id is required".to_string());
    }
    let Some(mut cfg) = registry.get(&req.id) else {
        return Err("connection not found".to_string());
    };

    if let Some(name) = req.name {
        if name.trim().is_empty() {
            return Err("name is required".to_string());
        }
        cfg.name = name;
    }

    if let Some(url) = req.url {
        if url.trim().is_empty() {
            return Err("url is required".to_string());
        }
        cfg.url = url;
    }

    if let Some(tags) = req.tags {
        cfg.tags = tags;
    }

    registry.upsert(cfg.clone());
    let _ = db_save_connections(root_path, registry).await;
    Ok(cfg.sanitized())
}

#[tauri::command]
pub async fn db_rename_connection_for_project(
    root_path: String,
    id: String,
    name: String,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<DbConnectionConfig, String> {
    if id.trim().is_empty() {
        return Err("id is required".to_string());
    }
    if name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    let req = DbUpdateConnectionRequest {
        id,
        name: Some(name),
        url: None,
        tags: None,
    };
    db_update_connection_for_project(root_path, req, registry).await
}

#[tauri::command]
pub async fn db_remove_connection(id: String, registry: tauri::State<'_, DbRegistry>) -> Result<bool, String> {
    if id.trim().is_empty() {
        return Err("id is required".to_string());
    }
    Ok(registry.remove(&id))
}

#[tauri::command]
pub async fn db_remove_connection_for_project(
    root_path: String,
    id: String,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<bool, String> {
    if id.trim().is_empty() {
        return Err("id is required".to_string());
    }
    let removed = registry.remove(&id);
    let store = connections_store_path(&root_path)?;
    let conns = registry.list();
    let _ = save_connections_to_path(&store, &conns);
    Ok(removed)
}

#[tauri::command]
pub async fn db_list_connections(registry: tauri::State<'_, DbRegistry>) -> Result<Vec<DbConnectionConfig>, String> {
    Ok(registry.list())
}

#[tauri::command]
pub async fn db_clear_connections(registry: tauri::State<'_, DbRegistry>) -> Result<bool, String> {
    registry.clear();
    Ok(true)
}

#[tauri::command]
pub async fn db_load_connections(root_path: String, registry: tauri::State<'_, DbRegistry>) -> Result<Vec<DbConnectionConfig>, String> {
    let store = connections_store_path(&root_path)?;
    let conns = load_connections_from_path(&store)?;
    registry.clear();
    for c in &conns {
        registry.upsert(c.clone());
    }
    Ok(registry.list())
}

#[tauri::command]
pub async fn db_save_connections(root_path: String, registry: tauri::State<'_, DbRegistry>) -> Result<bool, String> {
    let store = connections_store_path(&root_path)?;
    let conns = registry.list();
    save_connections_to_path(&store, &conns)?;
    Ok(true)
}

#[tauri::command]
pub async fn db_list_databases(id: String, registry: tauri::State<'_, DbRegistry>) -> Result<Vec<String>, String> {
    use sqlx::Row;

    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };

    match cfg.kind {
        DbKind::MySql => {
            use sqlx::mysql::MySqlPoolOptions;
            let pool = MySqlPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(8))
                .connect(&cfg.url)
                .await
                .map_err(|e| e.to_string())?;
            let rows = sqlx::query("SHOW DATABASES").fetch_all(&pool).await.map_err(|e| e.to_string())?;
            pool.close().await;
            Ok(rows
                .into_iter()
                .filter_map(|r| r.try_get::<String, _>(0).ok())
                .collect())
        }
        DbKind::PgSql | DbKind::H2Pg => {
            use sqlx::postgres::PgPoolOptions;
            let pool = PgPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(8))
                .connect(&cfg.url)
                .await
                .map_err(|e| e.to_string())?;
            // may require permissions; return what we can.
            let rows = sqlx::query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
                .fetch_all(&pool)
                .await
                .map_err(|e| e.to_string())?;
            pool.close().await;
            Ok(rows
                .into_iter()
                .filter_map(|r| r.try_get::<String, _>(0).ok())
                .collect())
        }
        DbKind::Sqlite => Ok(vec!["main".to_string()]),
        _ => Err("db kind does not support list databases".to_string()),
    }
}

#[tauri::command]
pub async fn db_list_schemas(id: String, registry: tauri::State<'_, DbRegistry>) -> Result<Vec<String>, String> {
    use sqlx::Row;

    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };

    match cfg.kind {
        DbKind::MySql => db_list_databases(id, registry).await,
        DbKind::PgSql | DbKind::H2Pg => {
            use sqlx::postgres::PgPoolOptions;
            let pool = PgPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(8))
                .connect(&cfg.url)
                .await
                .map_err(|e| e.to_string())?;
            let rows = sqlx::query("SELECT schema_name FROM information_schema.schemata ORDER BY schema_name")
                .fetch_all(&pool)
                .await
                .map_err(|e| e.to_string())?;
            pool.close().await;
            Ok(rows
                .into_iter()
                .filter_map(|r| r.try_get::<String, _>(0).ok())
                .collect())
        }
        DbKind::Sqlite => Ok(vec!["main".to_string()]),
        _ => Err("db kind does not support list schemas".to_string()),
    }
}

#[tauri::command]
pub async fn db_test_connection(id: String, registry: tauri::State<'_, DbRegistry>) -> Result<DbTestResult, String> {
    if id.trim().is_empty() {
        return Err("id is required".to_string());
    }

    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };

    test_connection_config(&cfg).await
}

async fn test_connection_config(cfg: &DbConnectionConfig) -> Result<DbTestResult, String> {
    match cfg.kind {
        DbKind::MySql => test_sqlx_mysql(&cfg.url).await,
        DbKind::PgSql => test_sqlx_postgres(&cfg.url).await,
        DbKind::Sqlite => test_sqlx_sqlite(&cfg.url).await,
        DbKind::H2Pg => test_sqlx_postgres(&cfg.url).await,
        DbKind::MongoDb => test_mongodb(&cfg.url).await,
        DbKind::Redis => test_redis(&cfg.url).await,
    }
}

async fn test_sqlx_mysql(url: &str) -> Result<DbTestResult, String> {
    use sqlx::mysql::MySqlPoolOptions;

    let pool = MySqlPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(url)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    pool.close().await;
    Ok(DbTestResult {
        ok: true,
        message: "MySQL connection ok".to_string(),
    })
}

async fn test_sqlx_postgres(url: &str) -> Result<DbTestResult, String> {
    use sqlx::postgres::PgPoolOptions;

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(url)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    pool.close().await;
    Ok(DbTestResult {
        ok: true,
        message: "PostgreSQL connection ok".to_string(),
    })
}

async fn test_sqlx_sqlite(url: &str) -> Result<DbTestResult, String> {
    use sqlx::sqlite::SqlitePoolOptions;

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect(url)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    pool.close().await;
    Ok(DbTestResult {
        ok: true,
        message: "SQLite connection ok".to_string(),
    })
}

async fn test_mongodb(url: &str) -> Result<DbTestResult, String> {
    use mongodb::bson::doc;

    let client = mongodb::Client::with_uri_str(url)
        .await
        .map_err(|e| e.to_string())?;

    client
        .database("admin")
        .run_command(doc! { "ping": 1 }, None)
        .await
        .map_err(|e| e.to_string())?;

    Ok(DbTestResult {
        ok: true,
        message: "MongoDB connection ok".to_string(),
    })
}

async fn test_redis(url: &str) -> Result<DbTestResult, String> {
    let client = redis::Client::open(url).map_err(|e| e.to_string())?;
    let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| e.to_string())?;

    let pong: String = redis::cmd("PING")
        .query_async(&mut conn)
        .await
        .map_err(|e| e.to_string())?;

    Ok(DbTestResult {
        ok: pong.to_ascii_lowercase().contains("pong"),
        message: format!("Redis ping: {}", pong),
    })
}

#[tauri::command]
pub async fn db_query_sql(id: String, sql: String, registry: tauri::State<'_, DbRegistry>) -> Result<DbQueryResult, String> {
    db_query_sql_paged(id, sql, DbQueryOptions { limit: Some(200), offset: Some(0), params: None }, registry).await
}

#[tauri::command]
pub async fn db_query_sql_paged(
    id: String,
    sql: String,
    opts: DbQueryOptions,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<DbQueryResult, String> {
    use sqlx::Column;
    use sqlx::Row;

    if id.trim().is_empty() {
        return Err("id is required".to_string());
    }
    if sql.trim().is_empty() {
        return Err("sql is required".to_string());
    }
    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };

    let sql_trim = sql.trim_start();
    let lower = sql_trim.to_lowercase();
    let treat_as_query = lower.starts_with("select") || lower.starts_with("with") || lower.starts_with("show") || lower.starts_with("describe") || lower.starts_with("pragma");

    let limit = opts.limit.unwrap_or(200) as i64;
    let offset = opts.offset.unwrap_or(0) as i64;
    let params = opts.params.unwrap_or_default();

    match cfg.kind {
        DbKind::MySql => {
            use sqlx::mysql::MySqlPoolOptions;
            let pool = MySqlPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(8))
                .connect(&cfg.url)
                .await
                .map_err(|e| e.to_string())?;

            if treat_as_query {
                // 直接执行用户输入的 SQL，不做任何修改
                let mut q = sqlx::query(sql_trim);
                for p in params {
                    q = match p {
                        serde_json::Value::Null => q.bind(Option::<String>::None),
                        serde_json::Value::Bool(b) => q.bind(b),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() { q.bind(i) }
                            else if let Some(f) = n.as_f64() { q.bind(f) }
                            else { q.bind(n.to_string()) }
                        }
                        serde_json::Value::String(s) => q.bind(s),
                        other => q.bind(other.to_string()),
                    };
                }
                let rows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;
                let columns = rows
                    .get(0)
                    .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
                    .unwrap_or_else(|| vec![]);
                let mut out_rows = Vec::new();
                for r in rows {
                    let mut vals = Vec::new();
                    for idx in 0..r.len() {
                        vals.push(sqlx_value_mysql(&r, idx));
                    }
                    out_rows.push(vals);
                }
                pool.close().await;
                Ok(DbQueryResult { columns, rows: out_rows, rows_affected: None })
            } else {
                let mut q = sqlx::query(sql_trim);
                for p in params {
                    q = match p {
                        serde_json::Value::Null => q.bind(Option::<String>::None),
                        serde_json::Value::Bool(b) => q.bind(b),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() { q.bind(i) }
                            else if let Some(f) = n.as_f64() { q.bind(f) }
                            else { q.bind(n.to_string()) }
                        }
                        serde_json::Value::String(s) => q.bind(s),
                        other => q.bind(other.to_string()),
                    };
                }
                let res = q.execute(&pool).await.map_err(|e| e.to_string())?;
                let affected = res.rows_affected();
                pool.close().await;
                Ok(DbQueryResult { columns: vec![], rows: vec![], rows_affected: Some(affected) })
            }
        }
        DbKind::PgSql | DbKind::H2Pg => {
            use sqlx::postgres::PgPoolOptions;
            let pool = PgPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(8))
                .connect(&cfg.url)
                .await
                .map_err(|e| e.to_string())?;

            if treat_as_query {
                // 直接执行用户输入的 SQL，不做任何修改
                let mut q = sqlx::query(sql_trim);
                // bind params first
                for p in params {
                    q = match p {
                        serde_json::Value::Null => q.bind(Option::<String>::None),
                        serde_json::Value::Bool(b) => q.bind(b),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() { q.bind(i) }
                            else if let Some(f) = n.as_f64() { q.bind(f) }
                            else { q.bind(n.to_string()) }
                        }
                        serde_json::Value::String(s) => q.bind(s),
                        other => q.bind(other.to_string()),
                    };
                }
                let rows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;
                let columns = rows
                    .get(0)
                    .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
                    .unwrap_or_else(|| vec![]);
                let mut out_rows = Vec::new();
                for r in rows {
                    let mut vals = Vec::new();
                    for idx in 0..r.len() {
                        vals.push(sqlx_value_postgres(&r, idx));
                    }
                    out_rows.push(vals);
                }
                pool.close().await;
                Ok(DbQueryResult { columns, rows: out_rows, rows_affected: None })
            } else {
                let mut q = sqlx::query(sql_trim);
                for p in params {
                    q = match p {
                        serde_json::Value::Null => q.bind(Option::<String>::None),
                        serde_json::Value::Bool(b) => q.bind(b),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() { q.bind(i) }
                            else if let Some(f) = n.as_f64() { q.bind(f) }
                            else { q.bind(n.to_string()) }
                        }
                        serde_json::Value::String(s) => q.bind(s),
                        other => q.bind(other.to_string()),
                    };
                }
                let res = q.execute(&pool).await.map_err(|e| e.to_string())?;
                let affected = res.rows_affected();
                pool.close().await;
                Ok(DbQueryResult { columns: vec![], rows: vec![], rows_affected: Some(affected) })
            }
        }
        DbKind::Sqlite => {
            use sqlx::sqlite::SqlitePoolOptions;
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(8))
                .connect(&cfg.url)
                .await
                .map_err(|e| e.to_string())?;

            if treat_as_query {
                // 直接执行用户输入的 SQL，不做任何修改
                let mut q = sqlx::query(sql_trim);
                for p in params {
                    q = match p {
                        serde_json::Value::Null => q.bind(Option::<String>::None),
                        serde_json::Value::Bool(b) => q.bind(b),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() { q.bind(i) }
                            else if let Some(f) = n.as_f64() { q.bind(f) }
                            else { q.bind(n.to_string()) }
                        }
                        serde_json::Value::String(s) => q.bind(s),
                        other => q.bind(other.to_string()),
                    };
                }
                let rows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;
                let columns = rows
                    .get(0)
                    .map(|r| r.columns().iter().map(|c| c.name().to_string()).collect())
                    .unwrap_or_else(|| vec![]);
                let mut out_rows = Vec::new();
                for r in rows {
                    let mut vals = Vec::new();
                    for idx in 0..r.len() {
                        vals.push(sqlx_value_sqlite(&r, idx));
                    }
                    out_rows.push(vals);
                }
                pool.close().await;
                Ok(DbQueryResult { columns, rows: out_rows, rows_affected: None })
            } else {
                let mut q = sqlx::query(sql_trim);
                for p in params {
                    q = match p {
                        serde_json::Value::Null => q.bind(Option::<String>::None),
                        serde_json::Value::Bool(b) => q.bind(b),
                        serde_json::Value::Number(n) => {
                            if let Some(i) = n.as_i64() { q.bind(i) }
                            else if let Some(f) = n.as_f64() { q.bind(f) }
                            else { q.bind(n.to_string()) }
                        }
                        serde_json::Value::String(s) => q.bind(s),
                        other => q.bind(other.to_string()),
                    };
                }
                let res = q.execute(&pool).await.map_err(|e| e.to_string())?;
                let affected = res.rows_affected();
                pool.close().await;
                Ok(DbQueryResult { columns: vec![], rows: vec![], rows_affected: Some(affected) })
            }
        }
        _ => Err("db kind does not support SQL query".to_string()),
    }
}

#[tauri::command]
pub async fn db_list_tables(id: String, registry: tauri::State<'_, DbRegistry>) -> Result<Vec<DbTableInfo>, String> {
    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };

    match cfg.kind {
        DbKind::MySql => {
            let r = db_query_sql(id, "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' ORDER BY table_schema, table_name".to_string(), registry).await?;
            Ok(r.rows
                .into_iter()
                .filter_map(|row| {
                    let schema = row.get(0).and_then(|v| v.as_str()).map(|s| s.to_string());
                    let name = row.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if name.is_empty() { None } else { Some(DbTableInfo { name, schema }) }
                })
                .collect())
        }
        DbKind::PgSql | DbKind::H2Pg => {
            let r = db_query_sql(id, "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name".to_string(), registry).await?;
            Ok(r.rows
                .into_iter()
                .filter_map(|row| {
                    let schema = row.get(0).and_then(|v| v.as_str()).map(|s| s.to_string());
                    let name = row.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if name.is_empty() { None } else { Some(DbTableInfo { name, schema }) }
                })
                .collect())
        }
        DbKind::Sqlite => {
            let r = db_query_sql(id, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name".to_string(), registry).await?;
            Ok(r.rows
                .into_iter()
                .filter_map(|row| {
                    let name = row.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    if name.is_empty() { None } else { Some(DbTableInfo { name, schema: None }) }
                })
                .collect())
        }
        DbKind::MongoDb => Err("use db_mongo_list_collections".to_string()),
        DbKind::Redis => Err("use db_redis_info".to_string()),
    }
}

#[tauri::command]
pub async fn db_list_columns(
    id: String,
    schema: Option<String>,
    table: String,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<Vec<DbColumnInfo>, String> {
    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };
    if table.trim().is_empty() {
        return Err("table is required".to_string());
    }

    let safe_table = table.replace('"', "\"\"");
    match cfg.kind {
        DbKind::MySql => {
            let mut sql = "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE ".to_string();
            if let Some(s) = schema {
                sql.push_str(&format!("table_schema='{}' AND ", s.replace('\'', "''")));
            }
            sql.push_str(&format!("table_name='{}' ORDER BY ordinal_position", safe_table.replace('\'', "''")));
            let r = db_query_sql(id, sql, registry).await?;
            Ok(r.rows
                .into_iter()
                .map(|row| {
                    let name = row.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let data_type = row.get(1).and_then(|v| v.as_str()).map(|s| s.to_string());
                    let nullable = row.get(2).and_then(|v| v.as_str()).map(|s| s.eq_ignore_ascii_case("yes"));
                    DbColumnInfo { name, data_type, nullable }
                })
                .collect())
        }
        DbKind::PgSql | DbKind::H2Pg => {
            let schema = schema.unwrap_or_else(|| "public".to_string());
            let sql = format!(
                "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='{}' AND table_name='{}' ORDER BY ordinal_position",
                schema.replace('\'', "''"),
                safe_table.replace('\'', "''")
            );
            let r = db_query_sql(id, sql, registry).await?;
            Ok(r.rows
                .into_iter()
                .map(|row| {
                    let name = row.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let data_type = row.get(1).and_then(|v| v.as_str()).map(|s| s.to_string());
                    let nullable = row.get(2).and_then(|v| v.as_str()).map(|s| s.eq_ignore_ascii_case("yes"));
                    DbColumnInfo { name, data_type, nullable }
                })
                .collect())
        }
        DbKind::Sqlite => {
            let sql = format!("PRAGMA table_info('{}')", safe_table.replace('\'', "''"));
            let r = db_query_sql(id, sql, registry).await?;
            Ok(r.rows
                .into_iter()
                .map(|row| {
                    let name = row.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let data_type = row.get(2).and_then(|v| v.as_str()).map(|s| s.to_string());
                    let nullable = row.get(3).and_then(|v| v.as_i64()).map(|x| x == 0);
                    DbColumnInfo { name, data_type, nullable }
                })
                .collect())
        }
        _ => Err("db kind does not support columns".to_string()),
    }
}

#[tauri::command]
pub async fn db_mongo_list_databases(id: String, registry: tauri::State<'_, DbRegistry>) -> Result<Vec<String>, String> {
    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };
    if cfg.kind != DbKind::MongoDb {
        return Err("db kind is not mongodb".to_string());
    }
    let client = mongodb::Client::with_uri_str(&cfg.url).await.map_err(|e| e.to_string())?;
    client.list_database_names(None, None).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn db_mongo_list_collections(
    id: String,
    database: String,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<Vec<String>, String> {
    if database.trim().is_empty() {
        return Err("database is required".to_string());
    }
    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };
    if cfg.kind != DbKind::MongoDb {
        return Err("db kind is not mongodb".to_string());
    }
    let client = mongodb::Client::with_uri_str(&cfg.url).await.map_err(|e| e.to_string())?;
    client
        .database(&database)
        .list_collection_names(None)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn db_mongo_run_command(
    id: String,
    database: String,
    command: serde_json::Value,
    registry: tauri::State<'_, DbRegistry>,
) -> Result<serde_json::Value, String> {
    if database.trim().is_empty() {
        return Err("database is required".to_string());
    }
    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };
    if cfg.kind != DbKind::MongoDb {
        return Err("db kind is not mongodb".to_string());
    }
    let client = mongodb::Client::with_uri_str(&cfg.url).await.map_err(|e| e.to_string())?;
    let doc = mongodb::bson::to_document(&command).map_err(|e| e.to_string())?;
    let out = client
        .database(&database)
        .run_command(doc, None)
        .await
        .map_err(|e| e.to_string())?;
    let json = mongodb::bson::from_document::<serde_json::Value>(out).map_err(|e| e.to_string())?;
    Ok(json)
}

#[tauri::command]
pub async fn db_redis_cmd(id: String, args: Vec<String>, registry: tauri::State<'_, DbRegistry>) -> Result<serde_json::Value, String> {
    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };
    if cfg.kind != DbKind::Redis {
        return Err("db kind is not redis".to_string());
    }
    if args.is_empty() {
        return Err("args is required".to_string());
    }

    let client = redis::Client::open(cfg.url.as_str()).map_err(|e| e.to_string())?;
    let mut conn = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;

    let mut cmd = redis::Cmd::new();
    for a in &args {
        cmd.arg(a);
    }
    let val: redis::Value = cmd.query_async(&mut conn).await.map_err(|e| e.to_string())?;
    Ok(redis_value_to_json(val))
}

#[tauri::command]
pub async fn db_redis_info(id: String, registry: tauri::State<'_, DbRegistry>) -> Result<String, String> {
    let Some(cfg) = registry.get(&id) else {
        return Err("connection not found".to_string());
    };
    if cfg.kind != DbKind::Redis {
        return Err("db kind is not redis".to_string());
    }

    let client = redis::Client::open(cfg.url.as_str()).map_err(|e| e.to_string())?;
    let mut conn = client.get_multiplexed_async_connection().await.map_err(|e| e.to_string())?;
    redis::cmd("INFO").query_async(&mut conn).await.map_err(|e| e.to_string())
}

fn redis_value_to_json(v: redis::Value) -> serde_json::Value {
    use base64::Engine as _;
    match v {
        redis::Value::Nil => serde_json::Value::Null,
        redis::Value::Int(i) => serde_json::Value::Number(i.into()),
        redis::Value::Data(bytes) => {
            match String::from_utf8(bytes.clone()) {
                Ok(s) => serde_json::Value::String(s),
                Err(_) => serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(bytes)),
            }
        }
        redis::Value::Bulk(items) => serde_json::Value::Array(items.into_iter().map(redis_value_to_json).collect()),
        redis::Value::Status(s) => serde_json::Value::String(s),
        redis::Value::Okay => serde_json::Value::String("OK".to_string()),
    }
}

fn sqlx_value_mysql(row: &sqlx::mysql::MySqlRow, idx: usize) -> serde_json::Value {
    use base64::Engine as _;
    use sqlx::Row;

    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v
            .map(|x| serde_json::Value::Number(serde_json::Number::from(x)))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v
            .and_then(serde_json::Number::from_f64)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|b| serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(b)))
            .unwrap_or(serde_json::Value::Null);
    }
    serde_json::Value::Null
}

fn sqlx_value_postgres(row: &sqlx::postgres::PgRow, idx: usize) -> serde_json::Value {
    use base64::Engine as _;
    use sqlx::Row;

    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v
            .map(|x| serde_json::Value::Number(serde_json::Number::from(x)))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v
            .and_then(serde_json::Number::from_f64)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|b| serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(b)))
            .unwrap_or(serde_json::Value::Null);
    }
    serde_json::Value::Null
}

fn sqlx_value_sqlite(row: &sqlx::sqlite::SqliteRow, idx: usize) -> serde_json::Value {
    use base64::Engine as _;
    use sqlx::Row;

    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v
            .map(|x| serde_json::Value::Number(serde_json::Number::from(x)))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v
            .and_then(serde_json::Number::from_f64)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|b| serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(b)))
            .unwrap_or(serde_json::Value::Null);
    }
    serde_json::Value::Null
}
