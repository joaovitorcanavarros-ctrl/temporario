import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import Configuracoes from "@/pages/Configuracoes";
import Dashboard from "@/pages/Dashboard";
import Desligamentos from "@/pages/Desligamentos";
import Importacao from "@/pages/Importacao";
import Login from "@/pages/Login";
import MilitarDetalhe from "@/pages/MilitarDetalhe";
import MilitarForm from "@/pages/MilitarForm";
import Relatorios from "@/pages/Relatorios";
import Temporarios from "@/pages/Temporarios";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/temporarios" element={<Temporarios />} />
        <Route path="/quadro/:categoria" element={<Temporarios />} />
        <Route path="/temporarios/novo" element={<MilitarForm />} />
        <Route path="/temporarios/:id" element={<MilitarDetalhe />} />
        <Route path="/temporarios/:id/editar" element={<MilitarForm />} />
        <Route path="/desligamentos" element={<Desligamentos />} />
        <Route path="/importacao" element={<Importacao />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
