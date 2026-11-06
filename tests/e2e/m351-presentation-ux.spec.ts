import { expect, test } from "@playwright/test";

for(const width of [375,1440]){
  test(`roteiro da demonstração é utilizável e responsivo em ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:900});
    const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto("/demonstracao");
    await expect(page.getByTestId("demo-landing")).toBeVisible();
    await expect(page.getByRole("heading",{name:/Uma cobertura real/})).toBeVisible();
    await expect(page.getByTestId("demo-landing")).toContainText("R$ 9.651,29");
    await page.getByRole("button",{name:"Abrir demonstração — Cobertura Tom",exact:true}).click();
    await expect(page.getByTestId("demo-budget-total")).toContainText("9.651,29");

    const guide=page.getByTestId("demo-presentation-journey");
    await expect(guide).toContainText("Etapa 1 de 5");
    await expect(page.getByRole("tablist",{name:"Áreas da demonstração"}).getByRole("tab")).toHaveCount(5);
    await expect(page.getByLabel("Quantidades comerciais confirmadas")).toContainText("107,65 m");
    await guide.getByRole("button",{name:"Próxima: Modelo"}).click();
    await expect(page.getByTestId("tom-geometry-pending")).toBeVisible();
    await expect(guide).toContainText("Etapa 2 de 5");
    await guide.getByRole("button",{name:"Próxima: Materiais"}).click();
    await expect(page.getByRole("heading",{name:"Materiais e quantidades comerciais"})).toBeVisible();

    await page.getByRole("tab",{name:"Engenharia",exact:true}).click();
    const progress=page.getByRole("progressbar",{name:"Assuntos com informações registradas"});
    await expect(progress).toHaveAttribute("value","0");
    await page.getByText("Apoios e restrições · Pendente",{exact:true}).click();
    await page.getByLabel("Apoios e restrições · informação disponível",{exact:true}).fill("Tom irá confirmar os apoios");
    await expect(progress).toHaveAttribute("value","1");
    await page.getByRole("button",{name:"Salvar demonstração",exact:true}).click();
    await page.reload();
    await page.getByRole("tab",{name:"Engenharia",exact:true}).click();
    await expect(page.getByRole("progressbar",{name:"Assuntos com informações registradas"})).toHaveAttribute("value","1");

    await page.getByRole("tab",{name:"Visão geral",exact:true}).click();
    await page.getByRole("button",{name:"Abrir demonstração estrutural separada",exact:true}).click();
    await expect(page.getByTestId("demo-permanent-warning")).toContainText("NÃO REPRESENTA A ESTRUTURA DO TOM");
    await expect(page.getByTestId("demo-presentation-journey")).toContainText("Etapa 1 de 3");
    await expect(page.getByRole("link",{name:"Voltar ao caso comercial Tom",exact:true})).toBeVisible();
    await expect(page.getByRole("link",{name:"Voltar ao caso comercial Tom",exact:true})).toHaveCount(1);
    await page.getByRole("link",{name:"Voltar ao caso comercial Tom",exact:true}).click();
    await expect(page.getByTestId("demo-budget-total")).toContainText("9.651,29");

    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(width===375){
      const scrolled=await page.getByRole("tablist",{name:"Áreas da demonstração"}).evaluate(el=>el.scrollWidth>el.clientWidth);
      expect(scrolled).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}
