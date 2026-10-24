# Attribute audit integrity

The committed EF migration `20261024212200_AppendOnlyAttributeEvents` installs a PostgreSQL `BEFORE UPDATE OR DELETE` trigger on `"AttributeEvents"`. Ordinary application writes can insert new audit rows, but attempts to rewrite or remove existing rows fail with SQLSTATE `23514`. This is enforced by PostgreSQL, including for direct SQL statements, rather than relying on the C# service convention alone.

The migration is SQL-only; the EF entity model and model snapshot are intentionally unchanged. The PostgreSQL integration test inserts an event and verifies that both an UPDATE and a DELETE fail while the original values remain intact.

**Operational boundaries:** A database owner or superuser can disable/drop the trigger, and a privileged migration account can roll it back. Run the API under a separate least-privileged database role, restrict schema ownership and DDL privileges to migrations, and protect backups and logs. This trigger is not cryptographic tamper evidence and does not replace off-database audit retention. Rollback of the migration intentionally removes the trigger without deleting historical events.
