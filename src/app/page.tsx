"use client";

import { useState, useEffect, useCallback } from "react";

type ResourceType = "operators" | "routes" | "schedules" | "bookings";

interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export default function ConsumerApp() {
  const [activeTab, setActiveTab] = useState<ResourceType>("operators");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);

  const [data, setData] = useState<any[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  // Reset filters when tab changes
  useEffect(() => {
    setSearch("");
    setStatusFilter("");
    setOffset(0);
    if (activeTab === "operators" || activeTab === "routes" || activeTab === "bookings") {
      setSortField("createdAt");
    } else if (activeTab === "schedules") {
      setSortField("departureTime");
    }
  }, [activeTab]);

  // Fetch API Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", limit.toString());
      params.set("offset", offset.toString());
      params.set("sort", sortField);
      params.set("order", sortOrder);

      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);

      const url = `${apiBaseUrl}/api/v1/${activeTab}?${params.toString()}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || `HTTP ${res.status} Error`);
      }

      setData(json.data || []);
      setMeta(json.meta || null);
    } catch (err: any) {
      setError(err.message || "Failed to fetch data from API");
      setData([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, statusFilter, sortField, sortOrder, limit, offset, apiBaseUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatNaira = (kobo: number) => {
    if (typeof kobo !== "number") return "₦0.00";
    return `₦${(kobo / 100).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (isoStr: string) => {
    if (!isoStr) return "-";
    return new Date(isoStr).toLocaleString("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const handlePrevPage = () => {
    setOffset((prev) => Math.max(0, prev - limit));
  };

  const handleNextPage = () => {
    if (meta?.hasMore) {
      setOffset((prev) => prev + limit);
    }
  };

  return (
    <div>
      {/* Navigation Tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <nav className="tabs-nav" aria-label="API Resource Selection">
          {(["operators", "routes", "schedules", "bookings"] as ResourceType[]).map((tab) => (
            <button
              key={tab}
              id={`tab-${tab}`}
              className={`tab-button ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.toUpperCase()}
            </button>
          ))}
        </nav>
        <span className="card-subtitle" id="target-endpoint">
          Target Endpoint: <code>/api/v1/{activeTab}</code>
        </span>
      </div>

      {/* Filter Controls Bar */}
      <div className="controls-card">
        <div className="input-group">
          <label className="input-label" htmlFor="search-input">Search Keyword</label>
          <input
            id="search-input"
            className="form-input"
            type="text"
            placeholder={activeTab === "operators" ? "Name or Headquarters..." : activeTab === "bookings" ? "Passenger name or ref..." : "Search..."}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="status-select">Filter Status</label>
          <select
            id="status-select"
            className="form-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All Statuses</option>
            {activeTab === "operators" && (
              <>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </>
            )}
            {activeTab === "routes" && (
              <>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </>
            )}
            {activeTab === "schedules" && (
              <>
                <option value="SCHEDULED">SCHEDULED</option>
                <option value="BOARDING">BOARDING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
              </>
            )}
            {activeTab === "bookings" && (
              <>
                <option value="CONFIRMED">CONFIRMED</option>
                <option value="CANCELLED">CANCELLED</option>
              </>
            )}
          </select>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="sort-field-select">Sort Field</label>
          <select
            id="sort-field-select"
            className="form-select"
            value={sortField}
            onChange={(e) => setSortField(e.target.value)}
          >
            {activeTab === "operators" && (
              <>
                <option value="createdAt">Created At</option>
                <option value="name">Name</option>
                <option value="code">Code</option>
              </>
            )}
            {activeTab === "routes" && (
              <>
                <option value="createdAt">Created At</option>
                <option value="baseFareAmount">Base Fare</option>
                <option value="distanceKm">Distance (km)</option>
                <option value="originCity">Origin City</option>
              </>
            )}
            {activeTab === "schedules" && (
              <>
                <option value="departureTime">Departure Time</option>
                <option value="fareAmount">Fare Amount</option>
                <option value="availableSeats">Available Seats</option>
                <option value="createdAt">Created At</option>
              </>
            )}
            {activeTab === "bookings" && (
              <>
                <option value="createdAt">Created At</option>
                <option value="seatNumber">Seat Number</option>
                <option value="totalAmount">Total Amount</option>
              </>
            )}
          </select>
        </div>

        <div className="input-group">
          <label className="input-label" htmlFor="sort-order-select">Order</label>
          <select
            id="sort-order-select"
            className="form-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-state" id="error-alert">
          <h3>API Error</h3>
          <p style={{ marginTop: "0.5rem", color: "var(--danger-color)" }}>{error}</p>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && !error && (
        <div className="cards-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && data.length === 0 && (
        <div className="empty-state" id="empty-state-card">
          <h3>No Records Found</h3>
          <p className="card-subtitle" style={{ marginTop: "0.5rem" }}>
            No records matched your current query parameters. Try adjusting your search keyword or filters.
          </p>
        </div>
      )}

      {/* Data Cards Grid */}
      {!loading && !error && data.length > 0 && (
        <div className="cards-grid" id="data-grid">
          {activeTab === "operators" &&
            data.map((op: any) => (
              <div key={op.id} className="data-card">
                <div>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{op.name}</div>
                      <div className="card-subtitle">Ticker: <strong>{op.code}</strong></div>
                    </div>
                    <span className={`badge ${op.status === "ACTIVE" ? "badge-active" : "badge-inactive"}`}>
                      {op.status}
                    </span>
                  </div>
                  <div className="card-row">
                    <span className="card-subtitle">Headquarters:</span>
                    <span>{op.headquarters}</span>
                  </div>
                  <div className="card-row">
                    <span className="card-subtitle">Phone:</span>
                    <span>{op.supportPhone}</span>
                  </div>
                  <div className="card-row">
                    <span className="card-subtitle">Email:</span>
                    <span>{op.supportEmail}</span>
                  </div>
                </div>
                <div style={{ marginTop: "1rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border-color)" }}>
                  <span className="card-subtitle">ID: <code>{op.id}</code></span>
                </div>
              </div>
            ))}

          {activeTab === "routes" &&
            data.map((rot: any) => (
              <div key={rot.id} className="data-card">
                <div>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{rot.originCity} ➔ {rot.destinationCity}</div>
                      <div className="card-subtitle">{rot.originState} State to {rot.destinationState} State</div>
                    </div>
                    <span className={`badge ${rot.status === "ACTIVE" ? "badge-active" : "badge-inactive"}`}>
                      {rot.status}
                    </span>
                  </div>
                  <div className="card-row">
                    <span className="card-subtitle">Operator:</span>
                    <span>{rot.operator?.name || rot.operatorId}</span>
                  </div>
                  <div className="card-row">
                    <span className="card-subtitle">Distance / Time:</span>
                    <span>{rot.distanceKm} km ({Math.round(rot.estimatedMinutes / 60)}h {rot.estimatedMinutes % 60}m)</span>
                  </div>
                </div>
                <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="card-subtitle">Base Fare</span>
                  <span className="price-tag">{formatNaira(rot.baseFareAmount)}</span>
                </div>
              </div>
            ))}

          {activeTab === "schedules" &&
            data.map((sch: any) => (
              <div key={sch.id} className="data-card">
                <div>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{sch.route?.originCity} ➔ {sch.route?.destinationCity}</div>
                      <div className="card-subtitle">{sch.operator?.name} • {sch.busModel}</div>
                    </div>
                    <span className="badge badge-scheduled">{sch.status}</span>
                  </div>
                  <div className="card-row">
                    <span className="card-subtitle">Departure:</span>
                    <span>{formatDate(sch.departureTime)}</span>
                  </div>
                  <div className="card-row">
                    <span className="card-subtitle">Available Seats:</span>
                    <span style={{ fontWeight: 700, color: sch.availableSeats > 0 ? "var(--success-color)" : "var(--danger-color)" }}>
                      {sch.availableSeats} / {sch.totalSeats} seats
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="card-subtitle">Trip Fare</span>
                  <span className="price-tag">{formatNaira(sch.fareAmount)}</span>
                </div>
              </div>
            ))}

          {activeTab === "bookings" &&
            data.map((bkg: any) => (
              <div key={bkg.id} className="data-card">
                <div>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{bkg.passengerName}</div>
                      <div className="card-subtitle">Ref: <strong>{bkg.bookingReference}</strong></div>
                    </div>
                    <span className={`badge ${bkg.status === "CONFIRMED" ? "badge-confirmed" : "badge-inactive"}`}>
                      {bkg.status}
                    </span>
                  </div>
                  <div className="card-row">
                    <span className="card-subtitle">Phone:</span>
                    <span>{bkg.passengerPhone}</span>
                  </div>
                  <div className="card-row">
                    <span className="card-subtitle">Seat Allocated:</span>
                    <span>Seat #{bkg.seatNumber}</span>
                  </div>
                </div>
                <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="card-subtitle">Total Paid</span>
                  <span className="price-tag">{formatNaira(bkg.totalAmount)}</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Pagination Controls Bar */}
      {meta && (
        <div className="pagination-bar" id="pagination-bar">
          <div className="card-subtitle" id="pagination-info">
            Showing offset <strong>{meta.offset}</strong> to <strong>{meta.offset + data.length}</strong> of <strong>{meta.total}</strong> records
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              id="btn-prev-page"
              className="btn-nav"
              onClick={handlePrevPage}
              disabled={offset === 0 || loading}
            >
              ← Previous Page
            </button>
            <button
              id="btn-next-page"
              className="btn-nav"
              onClick={handleNextPage}
              disabled={!meta.hasMore || loading}
            >
              Next Page →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
