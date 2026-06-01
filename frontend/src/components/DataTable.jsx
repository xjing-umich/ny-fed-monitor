import React from "react";

export default function DataTable({ table, lang, showFullLabel, emptyLabel, previewCount = 8 }) {
  const rows = table?.rows ?? [];
  const previewRows = rows.slice(0, previewCount);
  const hasOverflow = rows.length > previewCount;

  const renderTable = (renderRows) => (
    <div className="table-scroll">
      <table className="clean-table">
        <thead>
          <tr>
            {Object.keys(renderRows[0] ?? {}).map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renderRows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {Object.values(row).map((value, valueIndex) => (
                <td key={valueIndex}>{String(value ?? emptyLabel)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="table-panel">
      <h4>{lang === "zh" ? table.title_zh ?? table.title : table.title}</h4>
      {!rows.length ? (
        <p className="empty-note">{emptyLabel}</p>
      ) : (
        <>
          {renderTable(previewRows)}
          {hasOverflow ? (
            <details className="details-wrap">
              <summary>{showFullLabel}</summary>
              {renderTable(rows)}
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
