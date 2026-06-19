import TicketsDesktopLayout from "@/features/tickets/TicketsDesktopLayout";

// Fase A — Refator invisível.
// Toda a implementação atual da página foi movida, sem alterações de lógica
// ou visual, para `TicketsDesktopLayout`. Este wrapper existe para que a Fase B
// possa introduzir um shell mobile dedicado sem tocar no arquivo desktop.
const Tickets = () => {
  return <TicketsDesktopLayout />;
};

export default Tickets;
