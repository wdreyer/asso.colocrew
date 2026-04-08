"use client";

export default function DataTable({ columns, data }) {
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length ? (
            data.map((row, rowIndex) => (
              <tr key={row.id || rowIndex}>
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row, rowIndex) : row[col.key]}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="dash-table-empty">
                Aucune donnée.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
