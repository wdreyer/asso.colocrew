"use client";

import { useMemo, useState } from "react";

function normalizeValue(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function compareValues(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  const aNumValid = !Number.isNaN(aNum) && normalizeValue(a) !== "";
  const bNumValid = !Number.isNaN(bNum) && normalizeValue(b) !== "";
  if (aNumValid && bNumValid) return aNum - bNum;

  const aDate = Date.parse(String(a));
  const bDate = Date.parse(String(b));
  if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) return aDate - bDate;

  return normalizeValue(a).localeCompare(normalizeValue(b), "fr", { sensitivity: "base" });
}

export default function DataTable({
  columns,
  data,
  searchableKeys,
  defaultSortKey,
  defaultSortDirection = "asc",
  onRowClick,
  emptyLabel = "Aucune donn?e.",
  toolsInline = false,
}) {
  const columnsByKey = useMemo(
    () => Object.fromEntries((columns || []).map((col) => [col.key, col])),
    [columns],
  );

  const sortableColumns = useMemo(
    () =>
      columns
        .filter((col) => col.sortable !== false && (!col.render || typeof col.sortValue === "function"))
        .map((col) => col.key),
    [columns],
  );
  const initialSortKey =
    defaultSortKey && sortableColumns.includes(defaultSortKey) ? defaultSortKey : sortableColumns[0] || null;

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({
    key: initialSortKey,
    direction: defaultSortDirection === "desc" ? "desc" : "asc",
  });
  const [filters, setFilters] = useState({});

  const computedSearchKeys = useMemo(() => {
    if (Array.isArray(searchableKeys) && searchableKeys.length) return searchableKeys;
    return columns.filter((col) => !col.render).map((col) => col.key);
  }, [columns, searchableKeys]);

  const filterableColumns = useMemo(() => columns.filter((col) => col.filterable), [columns]);

  const filterOptions = useMemo(() => {
    const next = {};
    filterableColumns.forEach((col) => {
      const values = Array.from(new Set((data || []).map((row) => normalizeValue(row[col.key])).filter(Boolean)));
      next[col.key] = values;
    });
    return next;
  }, [data, filterableColumns]);

  const processedData = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (data || []).filter((row) => {
      const passesSearch =
        !q || computedSearchKeys.some((key) => normalizeValue(row[key]).toLowerCase().includes(q));
      if (!passesSearch) return false;

      return filterableColumns.every((col) => {
        const active = filters[col.key];
        if (!active || active === "all") return true;
        return normalizeValue(row[col.key]) === active;
      });
    });

    if (!sort.key) return filtered;
    return [...filtered].sort((a, b) => {
      const col = columnsByKey[sort.key];
      const aValue = typeof col?.sortValue === "function" ? col.sortValue(a) : a[sort.key];
      const bValue = typeof col?.sortValue === "function" ? col.sortValue(b) : b[sort.key];
      const result = compareValues(aValue, bValue);
      return sort.direction === "asc" ? result : -result;
    });
  }, [columnsByKey, computedSearchKeys, data, filterableColumns, filters, search, sort]);

  const toggleSort = (key) => {
    if (!sortableColumns.includes(key)) return;
    setSort((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
    });
  };

  return (
    <div className="dash-table-wrap">
      <div className={`dash-table-tools ${toolsInline ? "is-inline" : ""}`}>
        <input
          className="dash-input"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filterableColumns.map((col) => (
          <select
            key={col.key}
            className="dash-input"
            value={filters[col.key] || "all"}
            onChange={(e) => setFilters((prev) => ({ ...prev, [col.key]: e.target.value }))}
          >
            <option value="all">{col.filterLabel || `Tous (${col.label})`}</option>
            {(filterOptions[col.key] || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ))}
      </div>

      <table className="dash-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                <button
                  type="button"
                  className={`dash-th-sort ${sortableColumns.includes(col.key) ? "is-sortable" : ""}`}
                  onClick={() => toggleSort(col.key)}
                >
                  <span>{col.label}</span>
                  {sortableColumns.includes(col.key) ? (
                    <span className="dash-th-sort-indicator">
                      {sort.key === col.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {processedData.length ? (
            processedData.map((row, rowIndex) => (
              <tr
                key={row.id || rowIndex}
                className={onRowClick ? "dash-row-clickable" : ""}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row, rowIndex) : row[col.key]}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="dash-table-empty">
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
