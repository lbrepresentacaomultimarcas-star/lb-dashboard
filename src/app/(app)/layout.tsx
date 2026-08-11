import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { AuthGuard } from "@/components/auth-guard";
import { BottomNav } from "@/components/bottom-nav";
import { MobileDrawer } from "@/components/mobile-drawer";
import { MobileNavProvider } from "@/components/mobile-nav-context";
import { BrandBar } from "@/components/marca-dupla";
import { ImpersonacaoBar } from "@/components/impersonacao-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <MobileNavProvider>
        <div className="flex h-screen flex-col overflow-hidden">
          {/* Faixa de co-branding fixa no topo: LB (esq.) + Multimarcas (dir.) */}
          <BrandBar />
          {/* Só aparece durante "Entrar como consultor" */}
          <ImpersonacaoBar />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar />
              {/* pb extra no mobile pra não cobrir conteúdo com a bottom nav */}
              <main className="flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-6">
                {children}
              </main>
            </div>
          </div>
        </div>
        <MobileDrawer />
        <BottomNav />
      </MobileNavProvider>
    </AuthGuard>
  );
}
