import type { CSSProperties, ReactNode } from "react";
import bossifyLogo from "@/assets/bossify-logo.png";

// ---------------------------------------------------------------------------
// The app's main screens, rebuilt in HTML for the landing page. They follow
// the real pages (Overview, Orders, Products, Cost Breakdown, Reports) in
// the current app look, with one consistent set of sample figures -- the
// same "RM10,000 in sales, RM2,850 kept" shop the rest of the page uses.
// Everything is sized in container-query units (cqw), so a screen scales
// with whatever frame it sits in and the text never blurs the way a
// scaled-down screenshot does.
// ---------------------------------------------------------------------------
const INK = "#1E1730";
const INK_SOFT = "#5B5270";
const LINE = "#E1DCEC";
const PAGE = "#F4F1F9";
const PRIMARY = "#3B1E6D";
const GREEN = "#16A34A";
const RED = "#D92D4A";
const AMBER = "#B45309";
const DISPLAY = '"Space Grotesk", system-ui, sans-serif';
const BODY = '"IBM Plex Sans", system-ui, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

const u = (n: number) => `${n}cqw`;

const card: CSSProperties = {
  background: "#FFFFFF",
  border: `1px solid ${LINE}`,
  borderRadius: u(5),
  padding: `${u(3.5)} ${u(4.5)}`,
};

function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        containerType: "inline-size",
        width: "100%",
        height: "100%",
        background: PAGE,
        color: INK,
        fontFamily: BODY,
        textAlign: "left",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: u(2.5),
          padding: `${u(4)} ${u(5)} ${u(3)}`,
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <img src={bossifyLogo} alt="" style={{ width: u(8), height: u(8), objectFit: "contain" }} />
        <span style={{ fontSize: u(3.8), fontWeight: 700 }}>Bossify</span>
      </div>
      <div style={{ padding: `${u(4.5)} ${u(4.5)} 0` }}>{children}</div>
    </div>
  );
}

function Title({ children, chip }: { children: ReactNode; chip?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: u(2.5) }}>
      <p style={{ fontSize: u(6.4), fontWeight: 700, fontFamily: DISPLAY, margin: 0, letterSpacing: "-0.01em" }}>{children}</p>
      {chip && (
        <span style={{ fontSize: u(2.9), fontWeight: 600, padding: `${u(1)} ${u(2.6)}`, borderRadius: 999, background: "rgba(59,30,109,0.1)", color: PRIMARY }}>
          {chip}
        </span>
      )}
    </div>
  );
}

function Chips({ items, active = 0 }: { items: string[]; active?: number }) {
  return (
    <div style={{ display: "flex", gap: u(2), margin: `${u(3.5)} 0`, flexWrap: "nowrap", overflow: "hidden" }}>
      {items.map((c, i) => (
        <span
          key={c}
          style={{
            flexShrink: 0,
            fontSize: u(3.1),
            fontWeight: 600,
            padding: `${u(1.6)} ${u(3.4)}`,
            borderRadius: 999,
            background: i === active ? PRIMARY : "#FFFFFF",
            color: i === active ? "#FFFFFF" : INK_SOFT,
            border: `1px solid ${i === active ? PRIMARY : LINE}`,
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "dark" | "green" | "amber" | "red" }) {
  const t = {
    neutral: { background: "rgba(59,30,109,0.08)", color: INK_SOFT },
    dark: { background: "#120A24", color: "#FFFFFF" },
    green: { background: "rgba(22,163,74,0.12)", color: GREEN },
    amber: { background: "rgba(180,83,9,0.12)", color: AMBER },
    red: { background: "rgba(217,45,74,0.12)", color: RED },
  }[tone];
  return (
    <span style={{ ...t, flexShrink: 0, fontSize: u(2.7), fontWeight: 700, padding: `${u(0.8)} ${u(2.2)}`, borderRadius: 999 }}>
      {children}
    </span>
  );
}

const money: CSSProperties = { fontFamily: MONO, fontWeight: 600 };

// ---------------------------------------------------------------- Overview
export function OverviewScreen() {
  return (
    <Screen>
      <p style={{ fontSize: u(5.6), fontWeight: 700, fontFamily: DISPLAY, margin: 0, lineHeight: 1.15 }}>Good morning, Aina</p>
      <p style={{ fontSize: u(3), color: INK_SOFT, margin: `${u(1)} 0 ${u(2.2)}` }}>Here&apos;s how your business is doing.</p>
      <Tag tone="green">● TikTok Shop connected</Tag>

      <div style={{ ...card, marginTop: u(3.5) }}>
        <p style={{ fontSize: u(2.9), color: INK_SOFT, margin: 0 }}>This Month</p>
        {[
          ["Revenue", "RM 10,000.00"],
          ["Costs", "RM 7,150.00"],
        ].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", marginTop: u(1.8), fontSize: u(3.4) }}>
            <span style={{ color: INK_SOFT }}>{l}</span>
            <span style={money}>{v}</span>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: u(3), paddingTop: u(3) }}>
          <p style={{ fontSize: u(3.3), fontWeight: 700, margin: 0 }}>Real Profit</p>
          <p style={{ ...money, fontSize: u(9), fontWeight: 700, color: PRIMARY, margin: `${u(0.5)} 0 0`, letterSpacing: "-0.02em" }}>RM 2,850.00</p>
          <p style={{ fontSize: u(2.9), color: INK_SOFT, margin: `${u(0.5)} 0 0` }}>
            Profit margin <b style={{ color: INK }}>28.5%</b>
          </p>
        </div>
        <div style={{ borderTop: `1px solid ${LINE}`, marginTop: u(3), paddingTop: u(2.6), display: "flex", justifyContent: "space-between", fontSize: u(2.9), color: INK_SOFT }}>
          <span>
            Orders <b style={{ ...money, color: INK }}>128</b>
          </span>
          <b style={{ color: PRIMARY }}>See breakdown ›</b>
        </div>
      </div>

      <div style={{ ...card, marginTop: u(3.5), padding: `${u(3.5)} ${u(4.5)} ${u(1.5)}` }}>
        <p style={{ fontSize: u(3.7), fontWeight: 700, margin: 0 }}>Needs Attention</p>
        {[
          [AMBER, "3 products are low in stock"],
          [RED, "1 product is losing money"],
          ["#EA580C", "RM 420.00 in unpaid orders"],
        ].map(([c, l], i) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: u(2.5), padding: `${u(2.5)} 0`, borderTop: i ? `1px solid ${LINE}` : "none", fontSize: u(3.2) }}>
            <span style={{ width: u(1.6), height: u(1.6), borderRadius: 999, background: c, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{l}</span>
            <span style={{ color: INK_SOFT }}>›</span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: u(3.7), fontWeight: 700, margin: `${u(4)} 0 ${u(2.2)}` }}>Quick Actions</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: u(2) }}>
        {["New Order", "Add Product", "Add Cost", "Reports"].map((a) => (
          <div key={a} style={{ ...card, borderRadius: u(3.5), padding: `${u(3)} ${u(1)}`, textAlign: "center" }}>
            <p style={{ fontSize: u(4.4), color: PRIMARY, margin: 0, lineHeight: 1 }}>+</p>
            <p style={{ fontSize: u(2.5), fontWeight: 600, margin: `${u(1.2)} 0 0` }}>{a}</p>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginTop: u(3.5) }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: u(3.7), fontWeight: 700 }}>
          <span>Recent Orders</span>
          <span style={{ fontSize: u(3), color: PRIMARY }}>View all</span>
        </div>
        {[
          ["Nur Aisyah", "ORD-A1131", "RM 140.00"],
          ["Farah", "ORD-A1130", "RM 89.00"],
        ].map(([n, c, v]) => (
          <div key={c} style={{ display: "flex", alignItems: "center", gap: u(3), paddingTop: u(3) }}>
            <span style={{ width: u(9), height: u(9), borderRadius: 999, background: "#EFEBF6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: u(3.2), fontWeight: 700, color: INK_SOFT }}>
              {n[0]}
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: u(3.5), fontWeight: 700 }}>{n}</span>
              <span style={{ display: "block", fontSize: u(2.7), color: INK_SOFT }}>{c}</span>
            </span>
            <span style={{ ...money, fontSize: u(3.5) }}>{v}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ Orders
export function OrdersScreen() {
  const orders = [
    { name: "Nur Aisyah", src: "TikTok", status: "Paid", tone: "green" as const, code: "ORD-A1131", item: "Tudung Bawal Premium", qty: 2, amount: "RM 140.00", profit: "RM 56.00", action: "Send Receipt" },
    { name: "Farah", src: "Manual", status: "Unpaid", tone: "amber" as const, code: "ORD-A1130", item: "Serum Vitamin C", qty: 1, amount: "RM 89.00", profit: "RM 31.00", action: "Remind" },
    { name: "Siti", src: "TikTok", status: "Paid", tone: "green" as const, code: "ORD-A1129", item: "Lip Tint Set", qty: 3, amount: "RM 154.50", profit: "RM 42.00", action: "Send Receipt" },
  ];
  return (
    <Screen>
      <Title chip="12 today">Orders</Title>
      <div style={{ ...card, marginTop: u(3.5), padding: `${u(2.8)} ${u(4.5)}`, textAlign: "center", fontSize: u(3.2), fontWeight: 700, borderRadius: 999 }}>
        ↻ Sync TikTok orders
      </div>
      <p style={{ fontSize: u(2.6), color: INK_SOFT, textAlign: "center", margin: `${u(1.4)} 0 0` }}>Last synced: 5 min ago</p>
      <Chips items={["All", "Unpaid", "Paid", "Pending"]} />
      {orders.map((o) => (
        <div key={o.code} style={{ ...card, marginBottom: u(3) }}>
          <div style={{ display: "flex", alignItems: "center", gap: u(3) }}>
            <span style={{ width: u(10), height: u(10), borderRadius: 999, background: "#EFEBF6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: u(3.6), fontWeight: 700, color: PRIMARY, flexShrink: 0 }}>
              {o.name[0]}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: u(1.8) }}>
                <b style={{ fontSize: u(3.9) }}>{o.name}</b>
                <Tag tone={o.src === "TikTok" ? "dark" : "neutral"}>{o.src}</Tag>
              </span>
              <span style={{ display: "block", fontSize: u(2.7), color: INK_SOFT, fontFamily: MONO }}>{o.code}</span>
            </span>
            <Tag tone={o.tone}>● {o.status}</Tag>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: `1px solid ${LINE}`, marginTop: u(3), paddingTop: u(2.6), fontSize: u(3.2) }}>
            <span>
              {o.item} <span style={{ color: INK_SOFT }}>× {o.qty}</span>
            </span>
            <span style={{ ...money, fontSize: u(3.6) }}>{o.amount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: u(2.4) }}>
            <span style={{ fontSize: u(2.9), color: INK_SOFT }}>
              Profit <b style={{ ...money, color: GREEN }}>{o.profit}</b>
            </span>
            <span style={{ fontSize: u(2.9), fontWeight: 700, color: "#FFFFFF", background: o.action === "Remind" ? "#EA580C" : GREEN, padding: `${u(1.6)} ${u(3.4)}`, borderRadius: 999 }}>
              {o.action}
            </span>
          </div>
        </div>
      ))}
    </Screen>
  );
}

// ---------------------------------------------------------------- Products
export function ProductsScreen() {
  const items = [
    { name: "Tudung Bawal Premium", src: "TikTok", stock: 64, tag: "Healthy", tone: "green" as const, price: "70.00", cost: "42.00", profit: "28.00", bar: 0.85 },
    { name: "Serum Vitamin C", src: "TikTok", stock: 4, tag: "Low stock", tone: "amber" as const, price: "89.00", cost: "58.00", profit: "31.00", bar: 0.12 },
    { name: "Lip Tint Set", src: "Manual", stock: 0, tag: "Out of stock", tone: "red" as const, price: "51.50", cost: "37.50", profit: "14.00", bar: 0 },
  ];
  return (
    <Screen>
      <Title chip="42 items">Products</Title>
      <div style={{ ...card, marginTop: u(3.5) }}>
        <p style={{ fontSize: u(2.8), fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>Inventory Health</p>
        <div style={{ display: "flex", height: u(2), borderRadius: 999, overflow: "hidden", marginTop: u(2.2) }}>
          <span style={{ flex: 38, background: GREEN }} />
          <span style={{ flex: 3, background: "#F59E0B" }} />
          <span style={{ flex: 1, background: RED }} />
        </div>
        <p style={{ fontSize: u(2.7), color: INK_SOFT, margin: `${u(1.8)} 0 0` }}>● Healthy (38) &nbsp; ● Low (3) &nbsp; ● Out (1)</p>
      </div>
      <Chips items={["All sources (42)", "TikTok (36)", "Manual (6)"]} />
      {items.map((p) => (
        <div key={p.name} style={{ ...card, marginBottom: u(3) }}>
          <div style={{ display: "flex", alignItems: "center", gap: u(2) }}>
            <b style={{ fontSize: u(3.8), flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</b>
            <Tag tone={p.src === "TikTok" ? "dark" : "neutral"}>{p.src}</Tag>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: u(2) }}>
            <span style={{ fontSize: u(3) }}>
              <b style={{ ...money, fontSize: u(5.6) }}>{p.stock}</b> <span style={{ color: INK_SOFT }}>pcs left</span>
            </span>
            <Tag tone={p.tone}>{p.tag}</Tag>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: u(2), background: PAGE, borderRadius: u(3), padding: `${u(2.2)} ${u(3)}`, marginTop: u(2.4) }}>
            {[
              ["Price", p.price, INK],
              ["Cost", p.cost, INK],
              ["Profit", p.profit, GREEN],
            ].map(([l, v, c]) => (
              <span key={l}>
                <span style={{ display: "block", fontSize: u(2.5), color: INK_SOFT }}>{l}</span>
                <span style={{ ...money, display: "block", fontSize: u(3), color: c }}>RM {v}</span>
              </span>
            ))}
          </div>
          <div style={{ height: u(1.4), borderRadius: 999, background: "#EFEBF6", marginTop: u(2.6), overflow: "hidden" }}>
            <div style={{ width: `${p.bar * 100}%`, height: "100%", background: p.tone === "green" ? PRIMARY : "#F59E0B" }} />
          </div>
        </div>
      ))}
    </Screen>
  );
}

// ---------------------------------------------------------- Cost Breakdown
export function ProfitScreen() {
  const rows: { label: string; value: string; bold?: boolean; neg?: boolean; gap?: boolean }[] = [
    { label: "Gross Sales", value: "RM 10,000.00" },
    { label: "Net Revenue", value: "RM 10,000.00", bold: true },
    { label: "Product Cost", value: "−RM 5,000.00", neg: true, gap: true },
    { label: "Packaging Cost", value: "−RM 300.00", neg: true },
    { label: "Gross Profit", value: "RM 4,700.00", bold: true },
    { label: "Platform Fee", value: "−RM 800.00", neg: true, gap: true },
    { label: "Shipping Cost", value: "−RM 600.00", neg: true },
    { label: "Contribution Profit", value: "RM 3,300.00", bold: true },
  ];
  const row = (r: (typeof rows)[number], last: boolean) => (
    <div
      key={r.label}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: `${u(2.7)} 0`,
        marginTop: r.gap ? u(2) : 0,
        borderBottom: last ? "none" : `1px solid ${LINE}`,
        fontSize: u(3.9),
      }}
    >
      <span style={{ color: r.bold ? INK : INK_SOFT, fontWeight: r.bold ? 700 : 400 }}>{r.label}</span>
      <span style={{ color: r.neg ? RED : INK, fontWeight: r.bold ? 700 : 500, fontFamily: MONO, fontSize: u(3.7) }}>{r.value}</span>
    </div>
  );
  return (
    <Screen>
      <p style={{ fontSize: u(5.2), fontWeight: 700, fontFamily: DISPLAY, margin: 0 }}>‹&nbsp;&nbsp;Cost Breakdown</p>
      <Chips items={["This week", "This month", "All time"]} active={1} />
      <div style={{ ...card, padding: `${u(1.5)} ${u(4.5)}` }}>{rows.map((r, i) => row(r, i === rows.length - 1))}</div>
      <div style={{ ...card, padding: `${u(1.5)} ${u(4.5)}`, marginTop: u(3.5) }}>
        <p style={{ fontSize: u(2.9), fontWeight: 600, color: INK_SOFT, textTransform: "uppercase", letterSpacing: "0.04em", margin: `${u(2.4)} 0 0` }}>
          Operating Expenses
        </p>
        {row({ label: "Marketing & tools", value: "−RM 450.00", neg: true }, true)}
      </div>
      <div
        style={{
          marginTop: u(3.5),
          borderRadius: u(5),
          padding: `${u(4)} ${u(4.5)}`,
          background: "rgba(59,30,109,0.07)",
          border: "1px solid rgba(59,30,109,0.2)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span style={{ fontSize: u(4.2), fontWeight: 700 }}>Net Profit</span>
        <span style={{ fontSize: u(5), fontWeight: 700, fontFamily: MONO, color: GREEN }}>RM 2,850.00</span>
      </div>
    </Screen>
  );
}

// ----------------------------------------------------------------- Reports
export function ReportsScreen() {
  const reports = [
    ["Sales Report", "Revenue, orders, top products"],
    ["Profit Report", "Gross profit, margin, best & worst"],
    ["Stock Report", "In stock, low stock, out of stock"],
    ["Financial P&L", "Revenue, COGS, gross profit, margin"],
    ["Customer Statement", "Orders, spend, unpaid balance"],
    ["Supplier Report", "Spend, POs and restock history"],
    ["Order Reconciliation", "By status, payment and source"],
  ];
  return (
    <Screen>
      <Title>Reports</Title>
      <Chips items={["Today", "This Week", "This Month", "Custom"]} active={2} />
      {reports.map(([name, desc], i) => (
        <div key={name} style={{ ...card, padding: `${u(3)} ${u(4)}`, marginBottom: u(2.4), display: "flex", alignItems: "center", gap: u(3) }}>
          <span style={{ fontFamily: MONO, fontSize: u(3), color: INK_SOFT, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: u(3.6), fontWeight: 700 }}>{name}</span>
            <span style={{ display: "block", fontSize: u(2.6), color: INK_SOFT, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{desc}</span>
          </span>
          <span style={{ flexShrink: 0, fontSize: u(2.8), fontWeight: 700, color: "#FFFFFF", background: PRIMARY, padding: `${u(1.5)} ${u(3)}`, borderRadius: 999 }}>PDF</span>
        </div>
      ))}
    </Screen>
  );
}
