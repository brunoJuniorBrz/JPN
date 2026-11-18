import { withWorkflow } from "workflow/next";

// devIndicators: o selo flutuante do modo dev ficava sobre a barra de etapas do celular
// (canto inferior esquerdo). Só muda de lugar no desenvolvimento; não afeta o build.
export default withWorkflow({ devIndicators: { position: "top-right" } });
