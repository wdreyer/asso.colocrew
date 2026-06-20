from pathlib import Path
path = Path('src/components/dashboard/Transport.jsx')
text = path.read_text(encoding='utf-8')
start = text.index('              {segTix.map((ticket) => (')
end_marker = '              ))}'
end = text.index(end_marker, start) + len(end_marker)
new = '''              {segTix.map((ticket) => {
                const usedSeats = ticketUsedSeats(ticket, segPassengers);
                const freeSeats = ticketFreeSeats(ticket, segPassengers);
                return (
                  <div key={ticket.id} className={`tr-ticket-card${ticket.purchased ? " is-bought" : " is-missing"}`} onClick={() => setEditingTicketId(ticket.id)}>
                    <span className={`tr-ticket-status${ticket.purchased ? " is-bought" : " is-missing"}`}>{ticket.purchased ? "Achete" : "A acheter"}</span>
                    <div className="tr-ticket-card-info">
                      <span className="tr-ticket-card-name">{ticket.name || "Billet sans titre"}</span>
                      <div className="tr-ticket-card-meta">
                        {ticket.seats > 0 && <span>{ticket.seats} place{ticket.seats !== 1 ? "s" : ""}</span>}
                        {ticket.purchased && ticket.seats > 1 && <span>{usedSeats} utilisee{usedSeats !== 1 ? "s" : ""}</span>}
                        {ticket.purchased && ticket.seats > 1 && <span className={freeSeats > 0 ? "tr-ticket-free-seats" : ""}>{freeSeats} libre{freeSeats !== 1 ? "s" : ""}</span>}
                        {ticket.price ? <span>{formatMoney(Number(ticket.price))}</span> : null}
                        {ticket.bookingReference && <span>{ticket.bookingReference}</span>}
                      </div>
                    </div>
                    {ticket.url && <a href={ticket.url} target="_blank" rel="noreferrer" className="tr-ticket-card-pdf" onClick={(e) => e.stopPropagation()}>PDF</a>}
                    <button type="button" className="tr-pax-remove" title="Supprimer"
                      onClick={(e) => { e.stopPropagation(); setTickets((items) => items.filter((it) => it.id !== ticket.id)); }}>×</button>
                  </div>
                );
              })}'''
path.write_text(text[:start] + new + text[end:], encoding='utf-8')
