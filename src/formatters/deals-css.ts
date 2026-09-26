/**
 * Stylesheet for the `html-deals` markup, mirroring the canonical publishing
 * template so standalone previews match production.
 *
 * Lives in its own module so the MCP Apps viewer can bundle it for previews
 * without pulling in the rest of the formatter code.
 */
export const DEALS_CSS = `.amazon-deals-section {
  margin: 2rem 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.amazon-deals-header { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.75rem; color: #232f3e; }
.amazon-deal-row {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  max-height: 70px;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d5d9d9;
  border-radius: 2px;
  margin-bottom: -1px;
  background: #fff;
  overflow: hidden;
}
.amazon-deal-row:hover { background: #fafafa; }
.amazon-deal-image { display: flex; align-items: center; justify-content: center; height: 56px; }
.amazon-deal-image img { max-width: 56px; max-height: 56px; width: auto; height: auto; object-fit: contain; }
.amazon-deal-info { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.amazon-deal-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin: 0;
  color: #007185;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.amazon-deal-brand { font-size: 0.8rem; color: #565959; }
.amazon-deal-rating { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; }
.amazon-stars { color: #ff9900; }
.amazon-review-count { color: #565959; }
.amazon-deal-features { display: none; }
.amazon-deal-price {
  display: grid;
  grid-template-columns: auto auto;
  align-items: center;
  column-gap: 0.75rem;
  row-gap: 0;
  justify-items: end;
}
.amazon-price-amount { font-size: 1.05rem; font-weight: 700; color: #B12704; white-space: nowrap; }
.amazon-deal-savings { font-size: 0.75rem; color: #007600; white-space: nowrap; grid-column: 1; }
.amazon-buy-button {
  grid-column: 2;
  grid-row: 1 / span 2;
  background-color: #ffd814;
  color: #0F1111;
  padding: 0.4rem 1rem;
  border: 1px solid #fcd200;
  border-radius: 3px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  text-align: center;
  white-space: nowrap;
}
.amazon-buy-button:hover { background-color: #f7ca00; }
.amazon-deal-disclosure { font-size: 0.75rem; color: #565959; margin-top: 0.75rem; }
@media (max-width: 640px) {
  .amazon-deal-row { grid-template-columns: 48px minmax(0, 1fr); max-height: none; row-gap: 0.5rem; }
  .amazon-deal-price { grid-column: 1 / -1; justify-items: start; }
  .amazon-buy-button { grid-row: auto; }
}
`;
