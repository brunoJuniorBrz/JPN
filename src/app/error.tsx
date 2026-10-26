"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="panel error-panel"><h1>Não foi possível abrir esta página</h1><p>Tente novamente. Seus dados salvos permanecem no navegador.</p><button className="button" onClick={reset}>Tentar novamente</button></div>; }
