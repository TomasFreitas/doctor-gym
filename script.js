// ===== Constantes de negócio =====
const ID_RECEPCIONISTA = 1; // fixo (simulação)
const DIAS_VENCIMENTO = 5;

// Catálogo de planos (simula a tabela Plano do banco)
const PLANOS = {
  1: { IDPlano: 1, Nome: "Mensal",     Valor: 100, DuracaoMeses: 1 },
  2: { IDPlano: 2, Nome: "Trimestral", Valor: 250, DuracaoMeses: 3 },
  3: { IDPlano: 3, Nome: "Semestral",  Valor: 450, DuracaoMeses: 6 },
  4: { IDPlano: 4, Nome: "Anual",      Valor: 800, DuracaoMeses: 12 },
};

// Chaves do localStorage (uma "tabela" por chave)
const CHAVES = {
  alunos: "doctorgym_alunos",
  matriculas: "doctorgym_matriculas",
  pagamentos: "doctorgym_pagamentos",
};

// ===== Utilitários de armazenamento =====
function lerTabela(chave) {
  try {
    return JSON.parse(localStorage.getItem(chave)) || [];
  } catch {
    return [];
  }
}

function salvarRegistro(chave, registro) {
  const tabela = lerTabela(chave);
  tabela.push(registro);
  salvarTabela(chave, tabela);
}

function salvarTabela(chave, tabela) {
  localStorage.setItem(chave, JSON.stringify(tabela));
}

// Remove acentos e caixa para comparar textos (busca por nome)
function normalizar(texto) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Rótulo e cor da parcela. "Atrasado" é derivado: Pendente com vencimento já passado.
function rotuloPagamento(p, hoje) {
  if (p.Status === "Pago") return { texto: "Pago", classe: "tag-pago" };
  if (p.Status === "Cancelado") return { texto: "Cancelado", classe: "tag-cancelado" };
  if (p.Vencimento < hoje) return { texto: "Atrasado", classe: "tag-atrasado" };
  return { texto: "Pendente", classe: "" };
}

// ===== Utilitários de data =====
// Formata como YYYY-MM-DD usando a data local (evita bug de fuso do toISOString)
function formatarData(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// Soma meses preservando o dia; se o mês destino for mais curto
// (ex.: 31/01 + 1 mês), usa o último dia do mês (28/29/fev).
function somarMeses(data, meses) {
  const resultado = new Date(data.getFullYear(), data.getMonth() + meses, 1);
  const ultimoDia = new Date(resultado.getFullYear(), resultado.getMonth() + 1, 0).getDate();
  resultado.setDate(Math.min(data.getDate(), ultimoDia));
  return resultado;
}

function somarDias(data, dias) {
  const resultado = new Date(data);
  resultado.setDate(resultado.getDate() + dias);
  return resultado;
}

// ===== Validação =====
function cpfValido(cpf) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

  const digito = (tamanho) => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

function validar(dados) {
  if (!dados.cpf || !dados.nome || !dados.email || !dados.endereco || !dados.plano) {
    return "Preencha todos os campos.";
  }
  if (!cpfValido(dados.cpf)) return "CPF inválido.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) return "E-mail inválido.";
  if (!PLANOS[dados.plano]) return "Selecione um plano válido.";
  return null;
}

// ===== Regra de negócio: cadastrar aluno + matrícula + pagamento =====
function cadastrarAluno(dados) {
  const hoje = new Date();
  const plano = PLANOS[dados.plano];

  // ID único: timestamp + sufixo aleatório (evita colisão em cliques rápidos)
  const idAluno = Number(`${Date.now()}${Math.floor(Math.random() * 90 + 10)}`);

  const aluno = {
    IDAluno: idAluno,
    CPF: dados.cpf.replace(/\D/g, ""),
    Nome: dados.nome,
    Email: dados.email,
    Endereco: dados.endereco,
    DataInscricao: formatarData(hoje),
  };

  const matricula = {
    IDMatricula: Date.now(),
    IDAluno: idAluno,
    IDPlano: plano.IDPlano,
    IDRecepcionista: ID_RECEPCIONISTA,
    DataInicio: formatarData(hoje),
    DataFim: formatarData(somarMeses(hoje, plano.DuracaoMeses)),
    Status: "Ativa",
  };

  // Parcelado: 1 pagamento por mês (N = duração do plano). À vista: pagamento único.
  const totalParcelas = dados.forma === "avista" ? 1 : plano.DuracaoMeses;
  const primeiroVencimento = somarDias(hoje, DIAS_VENCIMENTO);
  const valores = dividirEmParcelas(plano.Valor, totalParcelas);

  const pagamentos = valores.map((valor, i) => ({
    IDPagamento: Date.now() + 1 + i,
    IDAluno: idAluno,
    IDPlano: plano.IDPlano,
    NumeroParcela: i + 1,
    TotalParcelas: totalParcelas,
    Valor: valor,
    Vencimento: formatarData(somarMeses(primeiroVencimento, i)),
    Status: "Pendente",
  }));

  salvarRegistro(CHAVES.alunos, aluno);
  salvarRegistro(CHAVES.matriculas, matricula);
  pagamentos.forEach((p) => salvarRegistro(CHAVES.pagamentos, p));

  return { aluno, matricula, pagamentos };
}

// Divide o valor em N parcelas, em centavos; os centavos que sobram vão
// 1 a 1 para as primeiras parcelas (ex.: R$ 250,00 em 3x = 83,34 + 83,33 + 83,33).
// A soma das parcelas sempre fecha exatamente o valor do plano.
function dividirEmParcelas(valorTotal, n) {
  const totalCentavos = Math.round(valorTotal * 100);
  const base = Math.floor(totalCentavos / n);
  const sobra = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100);
}

// Migração: cadastros antigos tinham 1 pagamento único, mesmo em planos longos.
// Converte esse pagamento em N parcelas mensais (uma vez só).
function migrarPagamentosAntigos() {
  const pagamentos = lerTabela(CHAVES.pagamentos);
  if (!pagamentos.some((p) => p.TotalParcelas === undefined)) return;

  const novos = [];
  pagamentos.forEach((p, idx) => {
    if (p.TotalParcelas !== undefined) {
      novos.push(p);
      return;
    }
    const plano = PLANOS[p.IDPlano];
    const n = plano ? plano.DuracaoMeses : 1;
    const valores = dividirEmParcelas(p.Valor, n);
    const [ano, mes, dia] = p.Vencimento.split("-").map(Number);
    const primeiroVenc = new Date(ano, mes - 1, dia);

    valores.forEach((valor, i) => {
      novos.push({
        ...p,
        IDPagamento: i === 0 ? p.IDPagamento : Number(`${p.IDPagamento}${i}`),
        NumeroParcela: i + 1,
        TotalParcelas: n,
        Valor: valor,
        Vencimento: formatarData(somarMeses(primeiroVenc, i)),
        Status: i === 0 ? p.Status : "Pendente",
      });
    });
  });
  localStorage.setItem(CHAVES.pagamentos, JSON.stringify(novos));
}
migrarPagamentosAntigos();

// ===== Interface: ícones, avatar, modal e notificações =====
// Ícones SVG em linha (traço), aplicados em qualquer elemento com data-ico.
const ICONES = {
  recepcao: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M19 8v6M16 11h6"/>',
  alunos: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1"/><path d="M16 4.1a4 4 0 0 1 0 7.8M18.5 14.5A5.5 5.5 0 0 1 22 20v1"/>',
  relatorio: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
  treinos: '<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
  faturas: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  exercicios: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M9 2v4M15 2v4M8 11h8M8 15h5"/>',
};

function svgIcone(nome) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome] || ""}</svg>`;
}

document.querySelectorAll("[data-ico]").forEach((el) => {
  el.innerHTML = svgIcone(el.dataset.ico); // conteúdo fixo do código, não vem do usuário
});

// Avatar com iniciais e cor estável por nome
function iniciais(nome) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function corDoNome(nome) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function aplicarAvatar(el, nome) {
  el.textContent = iniciais(nome);
  el.style.setProperty("--hue", corDoNome(nome));
}

// Célula de tabela com avatar + nome (+ linha de apoio opcional)
function criarCelulaPessoa(nome, apoio) {
  const td = document.createElement("td");
  const wrap = document.createElement("div");
  wrap.className = "pessoa";
  const av = document.createElement("span");
  av.className = "avatar";
  av.setAttribute("aria-hidden", "true");
  aplicarAvatar(av, nome);
  const txt = document.createElement("div");
  const n = document.createElement("span");
  n.className = "pessoa-nome";
  n.textContent = nome;
  txt.appendChild(n);
  if (apoio) {
    const sm = document.createElement("small");
    sm.textContent = apoio;
    txt.appendChild(sm);
  }
  wrap.append(av, txt);
  td.appendChild(wrap);
  return td;
}

// Notificação rápida no canto da tela
function toast(texto, tipo = "ok") {
  const area = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = `toast toast-${tipo}`;
  el.setAttribute("role", tipo === "erro" ? "alert" : "status");
  el.textContent = texto;
  area.appendChild(el);
  setTimeout(() => {
    el.classList.add("saindo");
    setTimeout(() => el.remove(), 250);
  }, 3800);
}

// Modal de confirmação: substitui o confirm() nativo. Retorna Promise<boolean>.
function confirmar({ titulo, texto, botao = "Confirmar", perigo = true }) {
  const modal = document.getElementById("modal");
  const ok = document.getElementById("modal-ok");
  const cancelar = document.getElementById("modal-cancelar");
  document.getElementById("modal-titulo").textContent = titulo;
  document.getElementById("modal-texto").textContent = texto;
  ok.textContent = botao;
  ok.className = perigo ? "btn-perigo" : "btn-prim";
  modal.classList.toggle("modal-neutro", !perigo);
  const anterior = document.activeElement;
  modal.hidden = false;
  ok.focus();

  return new Promise((resolve) => {
    const fechar = (resposta) => {
      modal.hidden = true;
      ok.removeEventListener("click", sim);
      cancelar.removeEventListener("click", nao);
      modal.removeEventListener("click", fora);
      document.removeEventListener("keydown", tecla);
      if (anterior && anterior.focus) anterior.focus({ preventScroll: true });
      resolve(resposta);
    };
    const sim = () => fechar(true);
    const nao = () => fechar(false);
    const fora = (e) => { if (e.target === modal) fechar(false); };
    const tecla = (e) => {
      if (e.key === "Escape") fechar(false);
      // Mantém o foco dentro do modal
      if (e.key === "Tab") {
        e.preventDefault();
        (document.activeElement === ok ? cancelar : ok).focus();
      }
    };
    ok.addEventListener("click", sim);
    cancelar.addEventListener("click", nao);
    modal.addEventListener("click", fora);
    document.addEventListener("keydown", tecla);
  });
}

// ===== Interface =====
const form = document.getElementById("form-aluno");
const erro = document.getElementById("erro");
const sucesso = document.getElementById("sucesso");

const moeda = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso) => iso.split("-").reverse().join("/");

// --- Resumo ao vivo (lateral) ---
function atualizarResumo() {
  const plano = PLANOS[form.plano.value];
  const set = (id, txt) => (document.getElementById(id).textContent = txt);

  if (!plano) {
    ["r-plano", "r-duracao", "r-total", "r-parcelas", "r-inicio", "r-fim", "r-venc"].forEach((id) => set(id, "—"));
    set("r-valor", "—");
    return;
  }

  const hoje = new Date();
  const totalParcelas = form.forma.value === "avista" ? 1 : plano.DuracaoMeses;
  const valores = dividirEmParcelas(plano.Valor, totalParcelas);
  set("r-total", moeda(plano.Valor));
  set("r-parcelas", totalParcelas === 1 ? "À vista" : `${totalParcelas}x de ${moeda(valores[0])}`);
  set("r-plano", plano.Nome);
  set("r-duracao", plano.DuracaoMeses === 1 ? "1 mês" : `${plano.DuracaoMeses} meses`);
  set("r-inicio", dataBR(formatarData(hoje)));
  set("r-fim", dataBR(formatarData(somarMeses(hoje, plano.DuracaoMeses))));
  set("r-venc", dataBR(formatarData(somarDias(hoje, DIAS_VENCIMENTO))));
  set("r-valor", moeda(valores[0]));
}

// --- Tabela de cadastros ---
function renderizarLista() {
  const alunos = lerTabela(CHAVES.alunos);
  const matriculas = lerTabela(CHAVES.matriculas);
  const pagamentos = lerTabela(CHAVES.pagamentos);
  const corpo = document.getElementById("tabela");

  corpo.innerHTML = "";
  document.getElementById("vazio").hidden = alunos.length > 0;

  alunos.slice().reverse().slice(0, 8).forEach((aluno) => {
    const mat = matriculas.find((m) => m.IDAluno === aluno.IDAluno);
    const pagsAluno = pagamentos
      .filter((p) => p.IDAluno === aluno.IDAluno)
      .sort((a, b) => a.NumeroParcela - b.NumeroParcela);
    const pag = pagsAluno[0];
    const plano = PLANOS[mat?.IDPlano];
    const n = pagsAluno.length;
    const textoValor = !pag ? "—" : n > 1 ? `${n}x de ${moeda(pag.Valor)}` : moeda(pag.Valor);

    const tr = document.createElement("tr");
    tr.appendChild(criarCelulaPessoa(aluno.Nome, aluno.Email));
    const celulas = [
      plano ? plano.Nome : "—",
      !mat ? "—" : mat.Status === "Inativa" ? "Cancelada" : dataBR(mat.DataFim),
      textoValor,
    ];
    celulas.forEach((txt) => {
      const td = document.createElement("td");
      td.textContent = txt; // textContent evita injeção de HTML
      tr.appendChild(td);
    });

    if (pag) {
      const fin = situacaoFinanceira(pagsAluno, formatarData(new Date()));
      tr.appendChild(criarTag(fin.texto, fin.classe));
    } else {
      tr.appendChild(criarCelula("—"));
    }

    corpo.appendChild(tr);
  });

  renderizarIndicadoresMatricula(alunos, matriculas, pagamentos);
}

// Indicadores rápidos da aba Matrículas
function renderizarIndicadoresMatricula(alunos, matriculas, pagamentos) {
  const hoje = formatarData(new Date());
  const mes = hoje.slice(0, 7);
  const ativas = matriculas.filter((m) => m.Status !== "Inativa");
  const novas = matriculas.filter((m) => m.DataInicio.startsWith(mes));
  const comAtraso = new Set(
    pagamentos.filter((p) => p.Status === "Pendente" && p.Vencimento < hoje).map((p) => p.IDAluno)
  );
  document.getElementById("ind-ativas").textContent = ativas.length;
  document.getElementById("ind-novas").textContent = novas.length;
  document.getElementById("ind-atraso").textContent = comAtraso.size;
  document.getElementById("ind-atraso-card").classList.toggle("alerta", comAtraso.size > 0);
}

// --- Máscara de CPF ---
document.getElementById("cpf").addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

form.plano.addEventListener("change", atualizarResumo);
form.forma.addEventListener("change", atualizarResumo);

// --- Envio ---
function marcarInvalidos(dados) {
  const campos = ["cpf", "nome", "email", "endereco", "plano"];
  campos.forEach((c) => form[c].classList.remove("invalido"));
  if (!dados.cpf || !cpfValido(dados.cpf)) form.cpf.classList.add("invalido");
  if (!dados.nome) form.nome.classList.add("invalido");
  if (!dados.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) form.email.classList.add("invalido");
  if (!dados.endereco) form.endereco.classList.add("invalido");
  if (!PLANOS[dados.plano]) form.plano.classList.add("invalido");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  sucesso.hidden = true;

  const dados = {
    cpf: form.cpf.value.trim(),
    nome: form.nome.value.trim(),
    email: form.email.value.trim(),
    endereco: form.endereco.value.trim(),
    plano: form.plano.value,
    forma: form.forma.value,
  };

  const mensagemErro = validar(dados);
  marcarInvalidos(dados);
  if (mensagemErro) {
    erro.textContent = mensagemErro;
    erro.hidden = false;
    return;
  }
  erro.hidden = true;

  const resultado = cadastrarAluno(dados);

  console.log("Cadastro gerado (JSON):");
  console.log(JSON.stringify(resultado, null, 2));

  const primeira = resultado.pagamentos[0];
  const np = resultado.pagamentos.length;
  const textoPag = np > 1
    ? `${np} parcelas mensais de ${moeda(primeira.Valor)}`
    : `pagamento único de ${moeda(primeira.Valor)}`;

  sucesso.textContent =
    `${resultado.aluno.Nome} cadastrado! Matrícula ativa até ${dataBR(resultado.matricula.DataFim)}. ` +
    `${textoPag}; a 1ª vence em ${dataBR(primeira.Vencimento)}.`;
  sucesso.hidden = false;

  toast(`${resultado.aluno.Nome.split(" ")[0]} matriculado com sucesso.`);

  form.reset();
  atualizarResumo();
  renderizarLista();
  fecharFormMatricula();
});

// --- Formulário recolhido: abre só pelo botão "+ Nova matrícula" ---
const matriculaFormBloco = document.getElementById("matricula-form-bloco");
const btnNovaMatricula = document.getElementById("btn-nova-matricula");

const ctaMatricula = document.getElementById("cta-matricula");

function abrirFormMatricula(idPlano) {
  sucesso.hidden = true;
  erro.hidden = true;
  form.reset();
  form.querySelectorAll(".invalido").forEach((el) => el.classList.remove("invalido"));
  if (idPlano) form.plano.value = String(idPlano);
  atualizarResumo();
  matriculaFormBloco.hidden = false;
  ctaMatricula.hidden = true;
  document.getElementById("side-resumo").hidden = false;
  form.cpf.focus();
}

function fecharFormMatricula() {
  matriculaFormBloco.hidden = true;
  ctaMatricula.hidden = false;
  erro.hidden = true;
  document.getElementById("side-resumo").hidden = true;
}

btnNovaMatricula.addEventListener("click", () => abrirFormMatricula());

// Atalhos por plano no destaque: abre o formulário com o plano já escolhido
Object.values(PLANOS).forEach((plano) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cta-plano";
  const nome = document.createElement("span");
  nome.className = "cta-plano-nome";
  nome.textContent = plano.Nome;
  const valor = document.createElement("strong");
  valor.textContent = moeda(plano.Valor);
  const det = document.createElement("small");
  const parcela = dividirEmParcelas(plano.Valor, plano.DuracaoMeses)[0];
  det.textContent = plano.DuracaoMeses === 1 ? "1 mês" : `${plano.DuracaoMeses} meses · ${plano.DuracaoMeses}x de ${moeda(parcela)}`;
  btn.append(nome, valor, det);
  btn.addEventListener("click", () => abrirFormMatricula(plano.IDPlano));
  document.getElementById("cta-planos").appendChild(btn);
});
document.getElementById("matricula-fechar").addEventListener("click", fecharFormMatricula);

// --- Limpar dados (útil entre demonstrações) ---
document.getElementById("limpar").addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "Apagar todos os dados?",
    texto: "Alunos, matrículas, pagamentos e treinos salvos neste navegador serão apagados. Esta ação não pode ser desfeita.",
    botao: "Apagar tudo",
  });
  if (!ok) return;
  Object.values(CHAVES).forEach((c) => localStorage.removeItem(c));
  sucesso.hidden = true;
  renderizarLista();
  toast("Dados apagados.");
});

atualizarResumo();
renderizarLista();

// ===== Navegação entre telas =====
const TELAS = {
  recepcao: "view-recepcao",
  "recepcao-alunos": "view-recepcao-alunos",
  "recepcao-relatorio": "view-recepcao-relatorio",
  "aluno-treinos": "view-aluno-treinos",
  "aluno-faturas": "view-aluno-faturas",
  "prof-alunos": "view-prof-alunos",
  "prof-treinos": "view-prof-treinos",
  "prof-exercicios": "view-prof-exercicios",
};

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const alvo = btn.dataset.view;
    Object.entries(TELAS).forEach(([chave, id]) => {
      document.getElementById(id).hidden = chave !== alvo;
    });
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("ativo", b === btn));
    // Resumo da matrícula na lateral só enquanto o formulário estiver aberto
    document.getElementById("side-resumo").hidden =
      alvo !== "recepcao" || document.getElementById("matricula-form-bloco").hidden;
    if (alvo === "prof-alunos") renderizarProfAlunos();
    if (alvo === "prof-treinos") renderizarTreinos();
    if (alvo === "prof-exercicios") renderizarExercicios();
    if (alvo === "recepcao") renderizarLista();
    if (alvo === "recepcao-alunos") renderizarBusca();
    if (alvo === "recepcao-relatorio") renderizarRelatorio();
  });
});

// Cria uma <td> com texto (textContent evita injeção de HTML)
function criarCelula(texto) {
  const td = document.createElement("td");
  td.textContent = texto;
  return td;
}

function criarTag(texto, classeExtra) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = classeExtra ? `tag ${classeExtra}` : "tag";
  span.textContent = texto;
  td.appendChild(span);
  return td;
}

// ===== US 2: Aluno consulta histórico de pagamentos =====
const formConsulta = document.getElementById("form-consulta");
const inputCpfConsulta = document.getElementById("cpf-consulta");
const consultaAviso = document.getElementById("consulta-aviso");
const consultaResultado = document.getElementById("consulta-resultado");

inputCpfConsulta.addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

function mostrarAviso(texto, classe) {
  consultaAviso.textContent = texto;
  consultaAviso.className = `banner ${classe}`;
  consultaAviso.hidden = false;
}

formConsulta.addEventListener("submit", (e) => {
  e.preventDefault();
  consultaAviso.hidden = true;
  consultaResultado.hidden = true;
  document.getElementById("fat-resumo").hidden = true;

  const cpf = inputCpfConsulta.value.replace(/\D/g, "");
  if (!cpfValido(cpf)) {
    mostrarAviso("CPF inválido.", "banner-erro");
    return;
  }

  const aluno = lerTabela(CHAVES.alunos).find((a) => a.CPF === cpf);
  if (!aluno) {
    mostrarAviso("Nenhum aluno encontrado com esse CPF.", "banner-erro");
    return;
  }

  const hoje = formatarData(new Date());
  const pagamentos = lerTabela(CHAVES.pagamentos)
    .filter((p) => p.IDAluno === aluno.IDAluno)
    .sort((a, b) => a.Vencimento.localeCompare(b.Vencimento));

  const corpo = document.getElementById("consulta-tabela");
  corpo.innerHTML = "";

  let pendencias = 0;
  let atrasadas = 0;
  let valorAberto = 0;
  let proximoVenc = null;
  pagamentos.forEach((p) => {
    const atrasado = p.Status === "Pendente" && p.Vencimento < hoje;
    if (p.Status === "Pendente") {
      pendencias++;
      valorAberto += p.Valor;
      if (!proximoVenc) proximoVenc = p.Vencimento;
    }
    if (atrasado) atrasadas++;

    const rotulo = rotuloPagamento(p, hoje);
    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(PLANOS[p.IDPlano] ? PLANOS[p.IDPlano].Nome : "—"));
    tr.appendChild(criarCelula(p.TotalParcelas > 1 ? `${p.NumeroParcela}/${p.TotalParcelas}` : "Única"));
    tr.appendChild(criarCelula(moeda(p.Valor)));
    tr.appendChild(criarCelula(dataBR(p.Vencimento)));
    tr.appendChild(criarTag(rotulo.texto, rotulo.classe));
    corpo.appendChild(tr);
  });

  document.getElementById("consulta-nome").textContent = "Histórico de parcelas";
  consultaResultado.hidden = false;

  const validas = pagamentos.filter((p) => p.Status !== "Cancelado");
  document.getElementById("fat-aberto").textContent = moeda(valorAberto);
  document.getElementById("fat-proximo").textContent = proximoVenc ? dataBR(proximoVenc) : "—";
  document.getElementById("fat-pagas").textContent =
    `${validas.filter((p) => p.Status === "Pago").length} de ${validas.length}`;
  document.querySelector("#fat-resumo .kpi").classList.toggle("alerta", atrasadas > 0);
  document.getElementById("fat-resumo").hidden = false;

  if (atrasadas > 0) {
    mostrarAviso(
      `Você tem ${atrasadas} parcela${atrasadas > 1 ? "s" : ""} em atraso. ` +
      `Total em aberto: ${moeda(valorAberto)} (${pendencias} parcela${pendencias > 1 ? "s" : ""}).`,
      "banner-erro"
    );
  } else if (pendencias > 0) {
    mostrarAviso(
      `Você tem ${pendencias} parcela${pendencias > 1 ? "s" : ""} em aberto, somando ${moeda(valorAberto)}. ` +
      `Próximo vencimento: ${dataBR(proximoVenc)}.`,
      "banner-aviso"
    );
  } else {
    mostrarAviso("Tudo certo! Você não tem pendências.", "banner-ok");
  }
});

// ===== US 3 / US 7: Banco de exercícios do professor =====
const GRUPOS = ["Peito", "Costas", "Ombros", "Bíceps", "Tríceps", "Pernas", "Abdômen"];

const EXERCICIOS = [
  { Nome: "Supino reto",            Grupo: "Peito",   Equipamento: "Barra",      Sugestao: "4 x 8-12" },
  { Nome: "Supino inclinado",       Grupo: "Peito",   Equipamento: "Halteres",   Sugestao: "3 x 10-12" },
  { Nome: "Crucifixo",              Grupo: "Peito",   Equipamento: "Halteres",   Sugestao: "3 x 12" },
  { Nome: "Puxada frontal",         Grupo: "Costas",  Equipamento: "Polia",      Sugestao: "4 x 10" },
  { Nome: "Remada curvada",         Grupo: "Costas",  Equipamento: "Barra",      Sugestao: "4 x 8-10" },
  { Nome: "Remada baixa",           Grupo: "Costas",  Equipamento: "Polia",      Sugestao: "3 x 12" },
  { Nome: "Desenvolvimento",        Grupo: "Ombros",  Equipamento: "Halteres",   Sugestao: "4 x 8-10" },
  { Nome: "Elevação lateral",       Grupo: "Ombros",  Equipamento: "Halteres",   Sugestao: "3 x 12-15" },
  { Nome: "Rosca direta",           Grupo: "Bíceps",  Equipamento: "Barra W",    Sugestao: "3 x 10-12" },
  { Nome: "Rosca martelo",          Grupo: "Bíceps",  Equipamento: "Halteres",   Sugestao: "3 x 12" },
  { Nome: "Tríceps pulley",         Grupo: "Tríceps", Equipamento: "Polia",      Sugestao: "3 x 12" },
  { Nome: "Tríceps testa",          Grupo: "Tríceps", Equipamento: "Barra W",    Sugestao: "3 x 10" },
  { Nome: "Agachamento livre",      Grupo: "Pernas",  Equipamento: "Barra",      Sugestao: "4 x 8-10" },
  { Nome: "Leg press 45°",          Grupo: "Pernas",  Equipamento: "Máquina",    Sugestao: "4 x 12" },
  { Nome: "Cadeira extensora",      Grupo: "Pernas",  Equipamento: "Máquina",    Sugestao: "3 x 12-15" },
  { Nome: "Abdominal supra",        Grupo: "Abdômen", Equipamento: "Colchonete", Sugestao: "3 x 20" },
  { Nome: "Prancha",                Grupo: "Abdômen", Equipamento: "Colchonete", Sugestao: "3 x 40 s" },
];

// Banco = catálogo fixo acima + exercícios cadastrados pelo professor (doctorgym_exercicios).
CHAVES.exercicios = "doctorgym_exercicios";

function listarExercicios() {
  return [...EXERCICIOS, ...lerTabela(CHAVES.exercicios)];
}

// Filtro comum (aba Exercícios e montagem de treino): grupo + texto no nome/equipamento
function filtrarExercicios(grupo, termo) {
  const t = normalizar(termo || "");
  return listarExercicios().filter(
    (x) =>
      (!grupo || x.Grupo === grupo) &&
      (!t || normalizar(x.Nome).includes(t) || normalizar(x.Equipamento).includes(t))
  );
}

// Preenche todos os <select> de grupo muscular a partir de GRUPOS
document.querySelectorAll(".js-grupos").forEach((sel) => {
  const vazio = document.createElement("option");
  vazio.value = "";
  vazio.textContent = sel.dataset.vazio || "Todos os grupos";
  sel.appendChild(vazio);
  GRUPOS.forEach((g) => {
    const op = document.createElement("option");
    op.value = g;
    op.textContent = g;
    sel.appendChild(op);
  });
});

const formExercicio = document.getElementById("form-exercicio");
const exErro = document.getElementById("ex-erro");
const exSucesso = document.getElementById("ex-sucesso");
const filtroGrupo = document.getElementById("grupo");
const exFormBloco = document.getElementById("ex-form-bloco");
const btnNovoExercicio = document.getElementById("btn-novo-exercicio");

// Formulário fica recolhido; abre só pelo botão "+ Cadastrar exercício"
function abrirFormExercicio() {
  exSucesso.hidden = true;
  exErro.hidden = true;
  formExercicio.reset();
  formExercicio.querySelectorAll(".invalido").forEach((el) => el.classList.remove("invalido"));
  exFormBloco.hidden = false;
  btnNovoExercicio.hidden = true;
  document.getElementById("ex-nome").focus();
}

function fecharFormExercicio() {
  exFormBloco.hidden = true;
  btnNovoExercicio.hidden = false;
  exErro.hidden = true;
}

btnNovoExercicio.addEventListener("click", abrirFormExercicio);
document.getElementById("ex-fechar").addEventListener("click", fecharFormExercicio);
const exBusca = document.getElementById("ex-busca");

// --- US 7: cadastrar ---
formExercicio.addEventListener("submit", (e) => {
  e.preventDefault();
  exSucesso.hidden = true;

  const nomeInput = document.getElementById("ex-nome");
  const grupoSelect = document.getElementById("ex-grupo");
  const nome = nomeInput.value.trim().replace(/\s+/g, " ");
  const grupo = grupoSelect.value;
  const equipamento = document.getElementById("ex-equip").value.trim();
  const sugestao = document.getElementById("ex-sugestao").value.trim();

  let mensagem = null;
  if (!nome) mensagem = "Informe o nome do exercício.";
  else if (!grupo) mensagem = "Selecione o grupo muscular.";
  else if (listarExercicios().some((x) => normalizar(x.Nome) === normalizar(nome))) {
    mensagem = `"${nome}" já existe no banco de exercícios.`;
  }

  nomeInput.classList.toggle("invalido", !nome);
  grupoSelect.classList.toggle("invalido", !grupo);
  if (mensagem) {
    exErro.textContent = mensagem;
    exErro.hidden = false;
    return;
  }
  exErro.hidden = true;

  const exercicio = {
    IDExercicio: Date.now(),
    IDProfessor: 1,
    Nome: nome,
    Grupo: grupo,
    Equipamento: equipamento || "—",
    Sugestao: sugestao || "3 x 12",
    DataCadastro: formatarData(new Date()),
  };
  salvarRegistro(CHAVES.exercicios, exercicio);
  console.log("Exercício cadastrado (JSON):");
  console.log(JSON.stringify(exercicio, null, 2));

  exSucesso.textContent = `"${exercicio.Nome}" adicionado ao grupo ${exercicio.Grupo}.`;
  exSucesso.hidden = false;
  formExercicio.reset();
  fecharFormExercicio();

  // Mostra o grupo do exercício recém-cadastrado na lista
  filtroGrupo.value = grupo;
  exBusca.value = "";
  renderizarExercicios();
});

// --- US 3: consultar por grupo ---
function renderizarExercicios() {
  const lista = filtrarExercicios(filtroGrupo.value, exBusca.value);
  const corpo = document.getElementById("grupo-tabela");

  corpo.innerHTML = "";
  lista.forEach((x) => {
    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(x.Nome));
    tr.appendChild(criarTag(x.Grupo, "tag-grupo"));
    tr.appendChild(criarCelula(x.Equipamento));
    tr.appendChild(criarCelula(x.Sugestao));
    tr.appendChild(x.IDExercicio ? criarTag("Cadastrado", "tag-ativa") : criarTag("Padrão", "tag-cancelado"));
    corpo.appendChild(tr);
  });

  document.getElementById("ex-vazio").hidden = lista.length > 0;
  document.getElementById("grupo-contagem").textContent =
    `${lista.length} exercício${lista.length !== 1 ? "s" : ""}`;
}

filtroGrupo.addEventListener("change", renderizarExercicios);
exBusca.addEventListener("input", renderizarExercicios);
renderizarExercicios();

// ===== Login por perfil =====
// Simulação de front-end: não é segurança real (sem backend, as credenciais
// ficam no código). Serve para demonstrar o controle de acesso por perfil.
const USUARIOS = {
  recepcao:  { usuario: "recepcao",  senha: "recepcao123",  nome: "Recepção" },
  professor: { usuario: "professor", senha: "professor123", nome: "Professor" },
};

// Aluna de demonstração (Ana Beatriz Costa nos dados de exemplo)
const CPF_ALUNO_DEMO = "12345678909";
const CPF_ALUNO_DEMO_FORMATADO = "123.456.789-09";

const ROTULO_PERFIL = { aluno: "Aluno", professor: "Professor", recepcao: "Recepcionista" };
const CHAVE_SESSAO = "doctorgym_sessao";
const SUBTITULO_PAINEL = {
  aluno: "Painel do aluno",
  professor: "Painel do professor",
  recepcao: "Painel da recepção",
};

const telaLogin = document.getElementById("tela-login");
const appEl = document.getElementById("app");
const formLogin = document.getElementById("form-login");
const loginErro = document.getElementById("login-erro");
const loginCpf = document.getElementById("login-cpf");
let perfilLogin = "aluno";

function lerSessao() {
  try {
    return JSON.parse(sessionStorage.getItem(CHAVE_SESSAO));
  } catch {
    return null;
  }
}

function salvarSessao(sessao) {
  try {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
  } catch { /* sem sessionStorage: segue sem persistir */ }
}

function limparSessao() {
  try {
    sessionStorage.removeItem(CHAVE_SESSAO);
  } catch { /* ignora */ }
}

loginCpf.addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

function selecionarPerfil(perfil) {
  perfilLogin = perfil;
  document.querySelectorAll(".perfil").forEach((b) => b.classList.toggle("ativo", b.dataset.perfil === perfil));
  document.getElementById("campo-cpf").hidden = perfil !== "aluno";
  document.getElementById("campos-staff").hidden = perfil === "aluno";
  loginErro.hidden = true;

  // Credenciais de demonstração; clicar no código preenche os campos
  const dica = document.getElementById("login-dica");
  dica.innerHTML = "";
  const chip = (texto, aoClicar) => {
    const c = document.createElement("code");
    c.textContent = texto;
    c.className = "dica-chip";
    c.title = "Clique para preencher";
    c.addEventListener("click", aoClicar);
    return c;
  };
  if (perfil === "aluno") {
    const cpfDemo = CPF_ALUNO_DEMO_FORMATADO;
    dica.append("Demonstração: aluna Ana, CPF ", chip(cpfDemo, () => {
      loginCpf.value = cpfDemo;
      loginCpf.focus();
    }));
  } else {
    const u = USUARIOS[perfil];
    const preencher = () => {
      document.getElementById("login-usuario").value = u.usuario;
      document.getElementById("login-senha").value = u.senha;
      document.getElementById("login-senha").focus();
    };
    dica.append("Demonstração: usuário ", chip(u.usuario, preencher), " e senha ", chip(u.senha, preencher));
  }
}

document.querySelectorAll(".perfil").forEach((b) => {
  b.addEventListener("click", () => selecionarPerfil(b.dataset.perfil));
});

function entrarNoApp(sessao) {
  telaLogin.hidden = true;
  appEl.hidden = false;

  // Cada perfil enxerga apenas a própria aba
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.hidden = b.dataset.perfil !== sessao.perfil;
  });
  document.getElementById("usuario-nome").textContent = sessao.nome;
  aplicarAvatar(document.getElementById("usuario-avatar"), sessao.nome);
  document.getElementById("usuario-perfil").textContent = ROTULO_PERFIL[sessao.perfil];
  document.getElementById("brand-sub").textContent = SUBTITULO_PAINEL[sessao.perfil];
  document.querySelector(`.nav-btn[data-perfil="${sessao.perfil}"]`).click(); // abre a 1ª aba do perfil

  // Aluno vê automaticamente os próprios pagamentos
  if (sessao.perfil === "aluno") {
    inputCpfConsulta.value = sessao.cpf;
    formConsulta.requestSubmit();
    renderizarMeusTreinos(sessao.cpf);
  }
}

formLogin.addEventListener("submit", (e) => {
  e.preventDefault();
  loginErro.hidden = true;

  let sessao = null;
  let mensagem = null;

  if (perfilLogin === "aluno") {
    const cpf = loginCpf.value.replace(/\D/g, "");
    // Aluna de demonstração: num navegador sem dados, carrega o exemplo automaticamente
    if (cpf === CPF_ALUNO_DEMO && lerTabela(CHAVES.alunos).length === 0) {
      carregarDadosDemo();
      toast("Dados de exemplo carregados.");
    }
    const aluno = cpfValido(cpf) ? lerTabela(CHAVES.alunos).find((a) => a.CPF === cpf) : null;
    if (!cpfValido(cpf)) mensagem = "CPF inválido.";
    else if (!aluno && cpf === CPF_ALUNO_DEMO) {
      mensagem = 'A aluna de demonstração não está nos dados atuais. Clique em "Carregar dados de exemplo".';
    } else if (!aluno) mensagem = "CPF não cadastrado. Procure a recepção.";
    else sessao = { perfil: "aluno", nome: aluno.Nome, cpf };
  } else {
    const cred = USUARIOS[perfilLogin];
    const usuario = document.getElementById("login-usuario").value.trim();
    const senha = document.getElementById("login-senha").value;
    if (usuario !== cred.usuario || senha !== cred.senha) mensagem = "Usuário ou senha inválidos.";
    else sessao = { perfil: perfilLogin, nome: cred.nome };
  }

  if (!sessao) {
    loginErro.textContent = mensagem;
    loginErro.hidden = false;
    return;
  }

  salvarSessao(sessao);
  formLogin.reset();
  entrarNoApp(sessao);
});

document.getElementById("sair").addEventListener("click", () => {
  limparSessao();
  // Limpa o que o perfil anterior estava vendo
  inputCpfConsulta.value = "";
  consultaAviso.hidden = true;
  consultaResultado.hidden = true;
  document.getElementById("fat-resumo").hidden = true;
  appEl.hidden = true;
  telaLogin.hidden = false;
  selecionarPerfil("aluno");
});

selecionarPerfil("aluno");

// ===== Professor: treinos (modelos) e atribuições =====
// Treino = modelo reutilizável (doctorgym_treinos).
// Atribuição = vínculo treino <-> aluno (doctorgym_treino_aluno), com Status Ativa/Inativa.
CHAVES.treinos = "doctorgym_treinos";
CHAVES.atribuicoes = "doctorgym_treino_aluno";
const ID_PROFESSOR = 1; // fixo (simulação)

// Migração: treinos salvos na versão anterior já tinham IDAluno.
// Separa o vínculo em uma atribuição e deixa o treino como modelo.
function migrarTreinosAntigos() {
  const treinos = lerTabela(CHAVES.treinos);
  if (!treinos.some((t) => t.IDAluno !== undefined)) return;

  const atribuicoes = lerTabela(CHAVES.atribuicoes);
  const modelos = treinos.map((t) => {
    if (t.IDAluno === undefined) return t;
    atribuicoes.push({
      IDAtribuicao: t.IDTreino,
      IDTreino: t.IDTreino,
      IDAluno: t.IDAluno,
      DataAtribuicao: t.DataCriacao,
    });
    const { IDAluno, ...modelo } = t;
    return modelo;
  });
  localStorage.setItem(CHAVES.treinos, JSON.stringify(modelos));
  localStorage.setItem(CHAVES.atribuicoes, JSON.stringify(atribuicoes));
}
migrarTreinosAntigos();

// Atribuições antigas não tinham Status: contam como "Ativa".
const atribuicaoAtiva = (a) => a.Status !== "Inativa";

// Atribui o treino; se já existia um vínculo inativo, reativa em vez de duplicar.
function atribuirTreino(idTreino, idAluno) {
  const atribuicoes = lerTabela(CHAVES.atribuicoes);
  const existente = atribuicoes.find((a) => a.IDTreino === idTreino && a.IDAluno === idAluno);
  if (existente) {
    existente.Status = "Ativa";
    existente.DataAtribuicao = formatarData(new Date());
    delete existente.DataInativacao;
    salvarTabela(CHAVES.atribuicoes, atribuicoes);
    return existente;
  }
  const atribuicao = {
    IDAtribuicao: Date.now() + 1,
    IDTreino: idTreino,
    IDAluno: idAluno,
    DataAtribuicao: formatarData(new Date()),
    Status: "Ativa",
  };
  salvarRegistro(CHAVES.atribuicoes, atribuicao);
  return atribuicao;
}

// US 9: inativa (aluno deixa de ver) ou reativa um treino atribuído
function alternarAtribuicao(idAtribuicao) {
  const atribuicoes = lerTabela(CHAVES.atribuicoes);
  const a = atribuicoes.find((x) => x.IDAtribuicao === idAtribuicao);
  if (!a) return null;
  if (atribuicaoAtiva(a)) {
    a.Status = "Inativa";
    a.DataInativacao = formatarData(new Date());
  } else {
    a.Status = "Ativa";
    delete a.DataInativacao;
  }
  salvarTabela(CHAVES.atribuicoes, atribuicoes);
  console.log("Atribuição alterada (JSON):");
  console.log(JSON.stringify(a, null, 2));
  return a;
}

// Remove só o vínculo treino <-> aluno (o treino continua existindo)
function removerAtribuicao(idAtribuicao) {
  const atribuicoes = lerTabela(CHAVES.atribuicoes);
  const restante = atribuicoes.filter((a) => a.IDAtribuicao !== idAtribuicao);
  salvarTabela(CHAVES.atribuicoes, restante);
  return atribuicoes.length !== restante.length;
}

// Exclui o treino e todos os vínculos dele com alunos
function excluirTreino(idTreino) {
  const treinos = lerTabela(CHAVES.treinos);
  const treino = treinos.find((t) => t.IDTreino === idTreino);
  if (!treino) return null;
  salvarTabela(CHAVES.treinos, treinos.filter((t) => t.IDTreino !== idTreino));

  const atribuicoes = lerTabela(CHAVES.atribuicoes);
  const restante = atribuicoes.filter((a) => a.IDTreino !== idTreino);
  salvarTabela(CHAVES.atribuicoes, restante);

  const resultado = { treino, vinculosRemovidos: atribuicoes.length - restante.length };
  console.log("Treino excluído (JSON):");
  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function criarBotao(texto, classe, aoClicar) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = classe;
  btn.textContent = texto;
  btn.addEventListener("click", aoClicar);
  return btn;
}

// Preenche um <select> mantendo a opção inicial
function preencherSelect(select, itens, textoVazio) {
  select.innerHTML = "";
  const vazio = document.createElement("option");
  vazio.value = "";
  vazio.textContent = textoVazio;
  select.appendChild(vazio);
  itens.forEach(({ valor, rotulo }) => {
    const op = document.createElement("option");
    op.value = valor;
    op.textContent = rotulo;
    select.appendChild(op);
  });
}

const gruposDoTreino = (t) => [...new Set(t.Exercicios.map((e) => e.Grupo))];
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function irParaAba(view) {
  document.querySelector(`.nav-btn[data-view="${view}"]`).click();
}

function alunosComMatriculaAtiva() {
  const mats = lerTabela(CHAVES.matriculas);
  return lerTabela(CHAVES.alunos)
    .filter((a) => mats.some((m) => m.IDAluno === a.IDAluno && m.Status !== "Inativa"))
    .sort((a, b) => a.Nome.localeCompare(b.Nome, "pt-BR"));
}

// =====================================================================
// Aba Treinos: lista de treinos + editor (criar / editar)
// =====================================================================
let ficha = [];         // exercícios do treino em montagem
let editandoId = null;  // IDTreino em edição (null = novo)

const editor = document.getElementById("treino-editor");
const btnNovoTreino = document.getElementById("btn-novo-treino");
const treinoNome = document.getElementById("treino-nome");
const treinoErro = document.getElementById("treino-erro");
const treinoSucesso = document.getElementById("treino-sucesso");
const treinoAluno = document.getElementById("treino-aluno");
const pickerBusca = document.getElementById("picker-busca");
const pickerGrupo = document.getElementById("picker-grupo");

function abrirEditor(idTreino = null) {
  treinoSucesso.hidden = true;
  treinoErro.hidden = true;
  treinoNome.classList.remove("invalido");
  const aviso = document.getElementById("treino-editando");

  if (idTreino !== null) {
    const treino = lerTabela(CHAVES.treinos).find((t) => t.IDTreino === idTreino);
    if (!treino) return;
    editandoId = idTreino;
    ficha = treino.Exercicios.map((ex) => ({ ...ex }));
    treinoNome.value = treino.Nome;
    const n = lerTabela(CHAVES.atribuicoes).filter((a) => a.IDTreino === idTreino && atribuicaoAtiva(a)).length;
    aviso.textContent = n > 0
      ? `As alterações valem para ${plural(n, "aluno", "alunos")} com este treino ativo.`
      : "Nenhum aluno tem este treino ativo no momento.";
    aviso.hidden = false;
    document.getElementById("treino-titulo").textContent = "Editar treino";
    document.getElementById("treino-salvar").textContent = "Salvar alterações";
    document.getElementById("campo-treino-aluno").hidden = true;
  } else {
    editandoId = null;
    ficha = [];
    treinoNome.value = "";
    aviso.hidden = true;
    document.getElementById("treino-titulo").textContent = "Novo treino";
    document.getElementById("treino-salvar").textContent = "Criar treino";
    document.getElementById("campo-treino-aluno").hidden = false;
    preencherSelect(
      treinoAluno,
      alunosComMatriculaAtiva().map((a) => ({ valor: a.IDAluno, rotulo: a.Nome })),
      "Não atribuir agora"
    );
  }

  editor.hidden = false;
  btnNovoTreino.hidden = true;
  pickerBusca.value = "";
  pickerGrupo.value = "";
  renderizarPicker();
  renderizarFicha();
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
  treinoNome.focus({ preventScroll: true });
}

function fecharEditor() {
  editandoId = null;
  ficha = [];
  editor.hidden = true;
  btnNovoTreino.hidden = false;
  treinoErro.hidden = true;
}

btnNovoTreino.addEventListener("click", () => abrirEditor());
document.getElementById("treino-fechar").addEventListener("click", fecharEditor);
pickerBusca.addEventListener("input", renderizarPicker);
pickerGrupo.addEventListener("change", renderizarPicker);

// --- Banco de exercícios dentro do editor ---
function renderizarPicker() {
  const lista = filtrarExercicios(pickerGrupo.value, pickerBusca.value);
  const ul = document.getElementById("picker-lista");
  ul.innerHTML = "";

  lista.forEach((x) => {
    const li = document.createElement("li");
    li.className = "picker-item";
    const info = document.createElement("div");
    const nome = document.createElement("strong");
    nome.textContent = x.Nome;
    const sub = document.createElement("small");
    sub.textContent = `${x.Grupo} · ${x.Sugestao}`;
    info.append(nome, sub);

    const naFicha = ficha.some((i) => i.Nome === x.Nome);
    const btn = criarBotao(naFicha ? "Adicionado" : "+ Adicionar", naFicha ? "btn-mini neutro" : "btn-mini", () =>
      adicionarAFicha(x)
    );
    btn.disabled = naFicha;
    li.append(info, btn);
    ul.appendChild(li);
  });

  if (lista.length === 0) {
    const li = document.createElement("li");
    li.className = "vazio";
    li.textContent = "Nenhum exercício encontrado.";
    ul.appendChild(li);
  }
}

function adicionarAFicha(x) {
  if (ficha.some((i) => i.Nome === x.Nome)) return;
  ficha.push({ Nome: x.Nome, Grupo: x.Grupo, Equipamento: x.Equipamento, Series: x.Sugestao });
  treinoErro.hidden = true;
  renderizarFicha();
  renderizarPicker();
}

function moverItem(i, delta) {
  const j = i + delta;
  if (j < 0 || j >= ficha.length) return;
  [ficha[i], ficha[j]] = [ficha[j], ficha[i]];
  renderizarFicha();
}

// --- Ficha em montagem (ordem, séries, remover) ---
function renderizarFicha() {
  const ol = document.getElementById("treino-itens");
  ol.innerHTML = "";
  document.getElementById("treino-vazio").hidden = ficha.length > 0;
  document.getElementById("ficha-contagem").textContent = ficha.length ? plural(ficha.length, "exercício", "exercícios") : "";

  ficha.forEach((item, i) => {
    const li = document.createElement("li");
    li.className = "ficha-item";

    const num = document.createElement("span");
    num.className = "ficha-num";
    num.textContent = i + 1;

    const info = document.createElement("div");
    info.className = "ficha-info";
    const nome = document.createElement("strong");
    nome.textContent = item.Nome;
    const grupo = document.createElement("small");
    grupo.textContent = item.Grupo;
    info.append(nome, grupo);

    const input = document.createElement("input");
    input.type = "text";
    input.value = item.Series;
    input.placeholder = "3 x 12";
    input.setAttribute("aria-label", `Séries x repetições de ${item.Nome}`);
    input.addEventListener("input", () => (ficha[i].Series = input.value));

    const acoes = document.createElement("div");
    acoes.className = "ficha-acoes";
    const sobe = criarBotao("↑", "btn-icone", () => moverItem(i, -1));
    sobe.disabled = i === 0;
    sobe.setAttribute("aria-label", `Mover ${item.Nome} para cima`);
    const desce = criarBotao("↓", "btn-icone", () => moverItem(i, 1));
    desce.disabled = i === ficha.length - 1;
    desce.setAttribute("aria-label", `Mover ${item.Nome} para baixo`);
    const remover = criarBotao("✕", "btn-icone perigo", () => {
      ficha.splice(i, 1);
      renderizarFicha();
      renderizarPicker();
    });
    remover.setAttribute("aria-label", `Remover ${item.Nome}`);
    acoes.append(sobe, desce, remover);

    li.append(num, info, input, acoes);
    ol.appendChild(li);
  });
}

// --- Salvar (criar ou editar) ---
document.getElementById("form-treino").addEventListener("submit", (e) => {
  e.preventDefault();
  treinoSucesso.hidden = true;

  const nome = treinoNome.value.trim();
  let mensagem = null;
  if (!nome) mensagem = "Informe o nome do treino.";
  else if (ficha.length === 0) mensagem = "Adicione ao menos um exercício ao treino.";
  else if (ficha.some((i) => !i.Series.trim())) mensagem = "Preencha séries x repetições de todos os exercícios.";

  treinoNome.classList.toggle("invalido", !nome);
  if (mensagem) {
    treinoErro.textContent = mensagem;
    treinoErro.hidden = false;
    return;
  }
  treinoErro.hidden = true;
  const exercicios = ficha.map((i) => ({ ...i, Series: i.Series.trim() }));

  if (editandoId !== null) {
    // US 9: atualiza o modelo; todo aluno com ele ativo passa a ver a versão nova
    const treinos = lerTabela(CHAVES.treinos);
    const treino = treinos.find((t) => t.IDTreino === editandoId);
    if (treino) {
      treino.Nome = nome;
      treino.Exercicios = exercicios;
      treino.DataAtualizacao = formatarData(new Date());
      salvarTabela(CHAVES.treinos, treinos);
      console.log("Treino atualizado (JSON):");
      console.log(JSON.stringify(treino, null, 2));
      treinoSucesso.textContent = `Treino "${treino.Nome}" atualizado.`;
    }
  } else {
    const treino = {
      IDTreino: Date.now(),
      IDProfessor: ID_PROFESSOR,
      Nome: nome,
      DataCriacao: formatarData(new Date()),
      Exercicios: exercicios,
    };
    salvarRegistro(CHAVES.treinos, treino);
    let texto = `Treino "${treino.Nome}" criado com ${plural(exercicios.length, "exercício", "exercícios")}`;
    if (treinoAluno.value) {
      const atribuicao = atribuirTreino(treino.IDTreino, Number(treinoAluno.value));
      const aluno = lerTabela(CHAVES.alunos).find((a) => a.IDAluno === atribuicao.IDAluno);
      texto += ` e atribuído a ${aluno ? aluno.Nome : "aluno"}.`;
    } else {
      texto += ". Para entregar a um aluno, use a aba Alunos.";
    }
    console.log("Treino criado (JSON):");
    console.log(JSON.stringify(treino, null, 2));
    treinoSucesso.textContent = texto;
  }

  treinoSucesso.hidden = false;
  fecharEditor();
  renderizarTreinos();
  treinoSucesso.scrollIntoView({ behavior: "smooth", block: "center" });
});

// --- Cards dos treinos ---
function renderizarTreinos() {
  const treinos = lerTabela(CHAVES.treinos).slice().reverse();
  const atribuicoes = lerTabela(CHAVES.atribuicoes);
  const grid = document.getElementById("treinos-lista");
  grid.innerHTML = "";
  document.getElementById("treinos-vazio").hidden = treinos.length > 0;

  treinos.forEach((t) => {
    const card = document.createElement("article");
    card.className = "card-treino";

    const topo = document.createElement("div");
    topo.className = "card-treino-topo";
    const titulo = document.createElement("h4");
    titulo.textContent = t.Nome;
    const meta = document.createElement("small");
    meta.textContent = `${plural(t.Exercicios.length, "exercício", "exercícios")} · ` +
      (t.DataAtualizacao ? `atualizado em ${dataBR(t.DataAtualizacao)}` : `criado em ${dataBR(t.DataCriacao)}`);
    topo.append(titulo, meta);

    const tags = document.createElement("div");
    tags.className = "tags";
    gruposDoTreino(t).forEach((g) => {
      const s = document.createElement("span");
      s.className = "tag tag-grupo";
      s.textContent = g;
      tags.appendChild(s);
    });

    const lista = document.createElement("ol");
    lista.className = "mini-lista";
    t.Exercicios.forEach((ex) => {
      const li = document.createElement("li");
      const nome = document.createElement("span");
      nome.textContent = ex.Nome;
      const series = document.createElement("span");
      series.className = "mini-series";
      series.textContent = ex.Series;
      li.append(nome, series);
      lista.appendChild(li);
    });

    const rodape = document.createElement("div");
    rodape.className = "card-treino-rodape";
    const vinculos = atribuicoes.filter((a) => a.IDTreino === t.IDTreino);
    const n = vinculos.filter(atribuicaoAtiva).length;
    const uso = document.createElement("small");
    uso.textContent = n > 0 ? `${plural(n, "aluno", "alunos")} com este treino` : "Nenhum aluno com este treino";
    const acoes = document.createElement("div");
    acoes.className = "acoes";
    acoes.append(
      criarBotao("Editar", "btn-mini neutro", () => abrirEditor(t.IDTreino)),
      criarBotao("Excluir", "btn-mini perigo", async () => {
        const aviso = vinculos.length > 0
          ? ` Ele será removido de ${plural(vinculos.length, "aluno", "alunos")} (${n} com o treino ativo).`
          : "";
        const ok = await confirmar({
          titulo: `Excluir "${t.Nome}"?`,
          texto: `Esta ação não pode ser desfeita.${aviso}`,
          botao: "Excluir treino",
        });
        if (!ok) return;
        const r = excluirTreino(t.IDTreino);
        if (!r) return;
        if (editandoId === t.IDTreino) fecharEditor();
        treinoSucesso.textContent = `Treino "${t.Nome}" excluído` +
          (r.vinculosRemovidos > 0 ? ` e removido de ${plural(r.vinculosRemovidos, "aluno", "alunos")}.` : ".");
        treinoSucesso.hidden = false;
        renderizarTreinos();
      })
    );
    rodape.append(uso, acoes);

    card.append(topo, tags, lista, rodape);
    grid.appendChild(card);
  });
}

// =====================================================================
// Aba Alunos: treinos de cada aluno (atribuir / inativar / reativar)
// =====================================================================
let profAberto = null; // IDAluno com o painel aberto
const profBusca = document.getElementById("prof-busca");
const profDetalhe = document.getElementById("prof-detalhe");
const noProf = (id) => profDetalhe.querySelector(`#${id}`);
const profMsg = noProf("prof-detalhe-msg");
const profSelect = noProf("prof-atrib-treino");

function renderizarProfAlunos() {
  const termo = profBusca.value.trim();
  const termoTexto = normalizar(termo);
  const termoDigitos = termo.replace(/\D/g, "");
  const temLetras = /[a-zà-ú]/i.test(termo);
  const matriculas = lerTabela(CHAVES.matriculas);
  const atribuicoes = lerTabela(CHAVES.atribuicoes);
  const todos = lerTabela(CHAVES.alunos);

  const alunos = todos
    .filter((a) => {
      if (!termo) return true;
      if (temLetras) return normalizar(a.Nome).includes(termoTexto);
      return termoDigitos.length > 0 && a.CPF.includes(termoDigitos);
    })
    .sort((a, b) => a.Nome.localeCompare(b.Nome, "pt-BR"));

  const corpo = document.getElementById("prof-alunos-tabela");
  corpo.innerHTML = "";
  alunos.forEach((aluno) => {
    const mat = matriculas.find((m) => m.IDAluno === aluno.IDAluno);
    const stMat = rotuloMatricula(mat);
    const ativos = atribuicoes.filter((a) => a.IDAluno === aluno.IDAluno && atribuicaoAtiva(a)).length;
    const aberto = aluno.IDAluno === profAberto;

    const tr = document.createElement("tr");
    tr.className = aberto ? "linha-aluno selecionado" : "linha-aluno";
    tr.appendChild(criarCelulaPessoa(aluno.Nome, PLANOS[mat?.IDPlano]?.Nome));
    tr.appendChild(criarTag(stMat.texto, stMat.classe));
    tr.appendChild(ativos > 0 ? criarTag(`${ativos} ativo${ativos > 1 ? "s" : ""}`, "tag-ativa") : criarTag("Sem treino", ""));

    const tdAcao = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = aberto ? "btn-mini neutro btn-expandir" : "btn-mini btn-expandir";
    btn.textContent = aberto ? "Fechar ▴" : "Ver ▾";
    btn.setAttribute("aria-expanded", String(aberto));
    tdAcao.appendChild(btn);
    tr.appendChild(tdAcao);
    tr.addEventListener("click", () => alternarProf(aluno.IDAluno));
    corpo.appendChild(tr);

    if (aberto) {
      const trDet = document.createElement("tr");
      trDet.className = "linha-detalhe";
      const td = document.createElement("td");
      td.colSpan = 4;
      td.appendChild(profDetalhe);
      trDet.appendChild(td);
      corpo.appendChild(trDet);
    }
  });

  document.getElementById("prof-alunos-vazio").hidden = alunos.length > 0;
  document.getElementById("prof-alunos-vazio").textContent =
    todos.length === 0 ? "Nenhum aluno cadastrado ainda." : "Nenhum aluno encontrado.";
  document.getElementById("prof-contagem").textContent =
    termo ? `${alunos.length} de ${todos.length}` : plural(todos.length, "aluno", "alunos");
}

function abrirProf(idAluno, mensagem) {
  const trocou = profAberto !== idAluno;
  profAberto = idAluno;
  renderizarProfDetalhe();
  profMsg.textContent = mensagem || "";
  profMsg.hidden = !mensagem;
  profDetalhe.classList.toggle("abrindo", trocou);
  renderizarProfAlunos();
}

function fecharProf() {
  profAberto = null;
  profDetalhe.hidden = true;
  renderizarProfAlunos();
}

function alternarProf(idAluno) {
  if (profAberto === idAluno) fecharProf();
  else abrirProf(idAluno);
}

function renderizarProfDetalhe() {
  const aluno = lerTabela(CHAVES.alunos).find((a) => a.IDAluno === profAberto);
  if (!aluno) {
    profDetalhe.hidden = true;
    return;
  }
  const mat = lerTabela(CHAVES.matriculas).find((m) => m.IDAluno === aluno.IDAluno);
  const matAtiva = mat && mat.Status !== "Inativa";
  const treinos = lerTabela(CHAVES.treinos);

  noProf("prof-detalhe-nome").textContent = `Treinos de ${aluno.Nome.split(" ")[0]}`;

  // Ativos primeiro, mais recentes no topo
  const doAluno = lerTabela(CHAVES.atribuicoes)
    .filter((a) => a.IDAluno === aluno.IDAluno)
    .reverse()
    .sort((x, y) => Number(atribuicaoAtiva(y)) - Number(atribuicaoAtiva(x)));

  const corpo = noProf("prof-atrib-tabela");
  corpo.innerHTML = "";
  doAluno.forEach((a) => {
    const treino = treinos.find((t) => t.IDTreino === a.IDTreino);
    const ativa = atribuicaoAtiva(a);
    const tr = document.createElement("tr");
    if (!ativa) tr.className = "inativo";
    tr.appendChild(criarCelula(treino ? treino.Nome : "Treino removido"));
    tr.appendChild(criarCelula(treino ? `${treino.Exercicios.length} · ${gruposDoTreino(treino).join(", ")}` : "—"));
    tr.appendChild(criarCelula(dataBR(a.DataAtribuicao)));
    tr.appendChild(criarTag(ativa ? "Ativo" : "Inativo", ativa ? "tag-ativa" : "tag-cancelado"));

    const tdAcao = document.createElement("td");
    const acoes = document.createElement("div");
    acoes.className = "acoes";
    acoes.appendChild(
      criarBotao(ativa ? "Inativar" : "Reativar", ativa ? "btn-mini neutro" : "btn-mini", () => {
        alternarAtribuicao(a.IDAtribuicao);
        const nomeT = treino ? `"${treino.Nome}"` : "Treino";
        abrirProf(aluno.IDAluno, ativa
          ? `${nomeT} inativado. ${aluno.Nome.split(" ")[0]} não vê mais este treino.`
          : `${nomeT} reativado.`);
      })
    );
    if (treino) {
      acoes.appendChild(
        criarBotao("Editar treino", "btn-mini neutro", () => {
          irParaAba("prof-treinos");
          abrirEditor(treino.IDTreino);
        })
      );
    }
    // Remove o vínculo de vez (o treino continua existindo para os outros alunos)
    acoes.appendChild(
      criarBotao("Remover", "btn-mini perigo", async () => {
        const nomeT = treino ? `"${treino.Nome}"` : "este treino";
        const ok = await confirmar({
          titulo: `Remover ${nomeT}?`,
          texto: `O treino sai da ficha de ${aluno.Nome}, mas continua disponível para outros alunos.`,
          botao: "Remover",
        });
        if (!ok) return;
        removerAtribuicao(a.IDAtribuicao);
        abrirProf(aluno.IDAluno, `${treino ? `"${treino.Nome}"` : "Treino"} removido de ${aluno.Nome.split(" ")[0]}.`);
      })
    );
    tdAcao.appendChild(acoes);
    tr.appendChild(tdAcao);
    corpo.appendChild(tr);
  });
  noProf("prof-atrib-vazio").hidden = doAluno.length > 0;

  // Atribuir: só treinos que ainda não estão ativos para o aluno
  const ativosIds = doAluno.filter(atribuicaoAtiva).map((a) => a.IDTreino);
  const disponiveis = treinos.filter((t) => !ativosIds.includes(t.IDTreino));
  preencherSelect(
    profSelect,
    disponiveis.map((t) => ({ valor: t.IDTreino, rotulo: t.Nome })),
    "Selecione o treino..."
  );
  profSelect.classList.remove("invalido");

  let nota = "";
  if (!matAtiva) nota = "Matrícula inativa: não é possível atribuir novos treinos.";
  else if (treinos.length === 0) nota = "Nenhum treino criado ainda. Crie um na aba Treinos.";
  else if (disponiveis.length === 0) nota = "Todos os treinos já estão ativos para este aluno.";
  const bloqueado = Boolean(nota);
  profSelect.disabled = bloqueado;
  noProf("form-prof-atribuir").querySelector("button").disabled = bloqueado;
  noProf("prof-atrib-nota").textContent = nota;
  noProf("prof-atrib-nota").hidden = !bloqueado;

  profDetalhe.hidden = false;
}

noProf("form-prof-atribuir").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!profSelect.value) {
    profSelect.classList.add("invalido");
    return;
  }
  const idTreino = Number(profSelect.value);
  const atribuicao = atribuirTreino(idTreino, profAberto);
  console.log("Treino atribuído (JSON):");
  console.log(JSON.stringify(atribuicao, null, 2));
  const treino = lerTabela(CHAVES.treinos).find((t) => t.IDTreino === idTreino);
  abrirProf(profAberto, `Treino "${treino ? treino.Nome : ""}" atribuído.`);
});

noProf("prof-detalhe-fechar").addEventListener("click", fecharProf);
profBusca.addEventListener("input", renderizarProfAlunos);

// ===== US 8: Aluno visualiza a ficha detalhada =====
// "4 x 8-12" -> séries "4", repetições "8-12". Formato livre fica inteiro em Séries.
function separarSeries(texto) {
  const m = /^\s*(\d+)\s*[xX×]\s*(.+?)\s*$/.exec(texto || "");
  return m ? { series: m[1], repeticoes: m[2] } : { series: texto || "—", repeticoes: "—" };
}

function renderizarMeusTreinos(cpf) {
  const lista = document.getElementById("meus-treinos-lista");
  lista.innerHTML = "";

  const aluno = lerTabela(CHAVES.alunos).find((a) => a.CPF === cpf);
  const treinos = lerTabela(CHAVES.treinos);
  // US 9: treinos inativados pelo professor não aparecem para o aluno
  const atribuicoes = aluno
    ? lerTabela(CHAVES.atribuicoes)
        .filter((a) => a.IDAluno === aluno.IDAluno && atribuicaoAtiva(a))
        .reverse()
    : [];

  let exibidos = 0;
  atribuicoes.forEach((at) => {
    const treino = treinos.find((t) => t.IDTreino === at.IDTreino);
    if (!treino) return;
    exibidos++;

    const card = document.createElement("div");
    card.className = "treino-card";

    const titulo = document.createElement("h4");
    titulo.textContent = treino.Nome;
    const sub = document.createElement("small");
    const grupos = [...new Set(treino.Exercicios.map((ex) => ex.Grupo))].join(", ");
    sub.textContent =
      `${grupos} · ${plural(treino.Exercicios.length, "exercício", "exercícios")} · atribuído em ${dataBR(at.DataAtribuicao)}` +
      (treino.DataAtualizacao ? ` · atualizado em ${dataBR(treino.DataAtualizacao)}` : "");

    const wrap = document.createElement("div");
    wrap.className = "tabela-wrap";
    const tabela = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    ["#", "Exercício", "Grupo", "Equipamento", "Séries", "Repetições"].forEach((h) => {
      const th = document.createElement("th");
      th.textContent = h;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");
    treino.Exercicios.forEach((ex, i) => {
      const { series, repeticoes } = separarSeries(ex.Series);
      const tr = document.createElement("tr");
      const tdNum = criarCelula(String(i + 1));
      tdNum.className = "num-ex";
      tr.appendChild(tdNum);
      tr.appendChild(criarCelula(ex.Nome));
      tr.appendChild(criarTag(ex.Grupo, "tag-grupo"));
      tr.appendChild(criarCelula(ex.Equipamento));
      tr.appendChild(criarCelula(series));
      tr.appendChild(criarCelula(repeticoes));
      tbody.appendChild(tr);
    });
    tabela.append(thead, tbody);
    wrap.appendChild(tabela);

    card.append(titulo, sub, wrap);
    lista.appendChild(card);
  });

  document.getElementById("meus-treinos-vazio").hidden = exibidos > 0;
}

// ===== Recepção: dados consolidados por aluno =====
function pagamentosDoAluno(idAluno) {
  return lerTabela(CHAVES.pagamentos)
    .filter((p) => p.IDAluno === idAluno)
    .sort((a, b) => a.Vencimento.localeCompare(b.Vencimento) || a.NumeroParcela - b.NumeroParcela);
}

// Situação financeira resumida: Atrasado > Em aberto > Em dia
function situacaoFinanceira(pags, hoje) {
  const pendentes = pags.filter((p) => p.Status === "Pendente");
  if (pendentes.some((p) => p.Vencimento < hoje)) return { texto: "Atrasado", classe: "tag-atrasado" };
  if (pendentes.length > 0) return { texto: "Em aberto", classe: "" };
  return { texto: "Em dia", classe: "tag-pago" };
}

function rotuloMatricula(mat) {
  if (!mat) return { texto: "—", classe: "" };
  return mat.Status === "Inativa"
    ? { texto: "Inativa", classe: "tag-cancelado" }
    : { texto: "Ativa", classe: "tag-ativa" };
}

const formatarCpf = (cpf) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

// ===== US 5: Buscar alunos por CPF ou nome =====
const inputBusca = document.getElementById("busca");
let alunoSelecionado = null; // IDAluno aberto no detalhe

function renderizarBusca() {
  const termo = inputBusca.value.trim();
  const termoTexto = normalizar(termo);
  const termoDigitos = termo.replace(/\D/g, "");
  const hoje = formatarData(new Date());
  const matriculas = lerTabela(CHAVES.matriculas);

  // Com letras no termo, busca só por nome; só dígitos/pontuação, busca por CPF
  const temLetras = /[a-zà-ú]/i.test(termo);
  const alunos = lerTabela(CHAVES.alunos)
    .filter((a) => {
      if (!termo) return true;
      if (temLetras) return normalizar(a.Nome).includes(termoTexto);
      return termoDigitos.length > 0 && a.CPF.includes(termoDigitos);
    })
    .sort((a, b) => a.Nome.localeCompare(b.Nome, "pt-BR"));

  const corpo = document.getElementById("busca-tabela");
  corpo.innerHTML = "";
  alunos.forEach((aluno) => {
    const mat = matriculas.find((m) => m.IDAluno === aluno.IDAluno);
    const plano = PLANOS[mat?.IDPlano];
    const fin = situacaoFinanceira(pagamentosDoAluno(aluno.IDAluno), hoje);
    const stMat = rotuloMatricula(mat);

    const aberto = aluno.IDAluno === alunoSelecionado;
    const tr = document.createElement("tr");
    tr.className = aberto ? "linha-aluno selecionado" : "linha-aluno";
    tr.appendChild(criarCelulaPessoa(aluno.Nome, aluno.Email));
    tr.appendChild(criarCelula(formatarCpf(aluno.CPF)));
    tr.appendChild(criarCelula(plano ? plano.Nome : "—"));
    tr.appendChild(criarTag(stMat.texto, stMat.classe));
    tr.appendChild(criarTag(fin.texto, fin.classe));

    // A linha inteira abre/fecha o detalhe; o botão só indica o estado
    const tdAcao = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = aberto ? "btn-mini neutro btn-expandir" : "btn-mini btn-expandir";
    btn.textContent = aberto ? "Fechar ▴" : "Ver ▾";
    btn.setAttribute("aria-expanded", String(aberto));
    tdAcao.appendChild(btn);
    tr.appendChild(tdAcao);
    tr.addEventListener("click", () => alternarDetalhe(aluno.IDAluno));
    corpo.appendChild(tr);

    // Painel "dropdown" logo abaixo do aluno selecionado
    if (aberto) {
      const trDet = document.createElement("tr");
      trDet.className = "linha-detalhe";
      const td = document.createElement("td");
      td.colSpan = 6;
      td.appendChild(detalhe);
      trDet.appendChild(td);
      corpo.appendChild(trDet);
    }
  });

  const total = lerTabela(CHAVES.alunos).length;
  document.getElementById("busca-vazio").hidden = alunos.length > 0;
  document.getElementById("busca-demo").hidden = total > 0;
  document.getElementById("busca-vazio").textContent =
    total === 0 ? "Nenhum aluno cadastrado ainda." : "Nenhum aluno encontrado.";
  document.getElementById("busca-contagem").textContent =
    termo ? `${alunos.length} de ${total}` : `${total} aluno${total !== 1 ? "s" : ""}`;
}

inputBusca.addEventListener("input", renderizarBusca);

// --- Detalhe do aluno (matrícula + parcelas) ---
// O painel é um único elemento, movido para dentro da tabela, abaixo do aluno aberto.
// Por isso as buscas internas usam detalhe.querySelector (ele pode estar fora do documento).
const detalhe = document.getElementById("detalhe");
const detalheSucesso = document.getElementById("detalhe-sucesso");
const noDetalhe = (id) => detalhe.querySelector(`#${id}`);

function alternarDetalhe(idAluno) {
  if (alunoSelecionado === idAluno) fecharDetalhe();
  else abrirDetalhe(idAluno);
}

function abrirDetalhe(idAluno, mensagem) {
  const trocouDeAluno = alunoSelecionado !== idAluno;
  alunoSelecionado = idAluno;
  renderizarDetalhe();
  if (mensagem) {
    detalheSucesso.textContent = mensagem;
    detalheSucesso.hidden = false;
  } else {
    detalheSucesso.hidden = true;
  }
  // Animação só quando abre (não ao atualizar após baixa/cancelamento)
  detalhe.classList.toggle("abrindo", trocouDeAluno);
  renderizarBusca();
}

function fecharDetalhe() {
  alunoSelecionado = null;
  detalhe.hidden = true;
  renderizarBusca();
}

function renderizarDetalhe() {
  const aluno = lerTabela(CHAVES.alunos).find((a) => a.IDAluno === alunoSelecionado);
  if (!aluno) {
    detalhe.hidden = true;
    return;
  }
  const mat = lerTabela(CHAVES.matriculas).find((m) => m.IDAluno === aluno.IDAluno);
  const plano = PLANOS[mat?.IDPlano];
  const hoje = formatarData(new Date());
  const pags = pagamentosDoAluno(aluno.IDAluno);
  const emAberto = pags.filter((p) => p.Status === "Pendente").reduce((s, p) => s + p.Valor, 0);

  noDetalhe("detalhe-nome").textContent = `Detalhes de ${aluno.Nome.split(" ")[0]}`;

  const info = noDetalhe("detalhe-info");
  info.innerHTML = "";
  const campos = [
    ["CPF", formatarCpf(aluno.CPF)],
    ["E-mail", aluno.Email],
    ["Plano", plano ? `${plano.Nome} (${moeda(plano.Valor)})` : "—"],
    ["Matrícula", !mat ? "—" : mat.Status === "Inativa"
      ? `Inativa desde ${dataBR(mat.DataCancelamento)}`
      : `Ativa até ${dataBR(mat.DataFim)}`],
    ["Em aberto", moeda(emAberto)],
  ];
  campos.forEach(([rotulo, valor]) => {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = rotulo;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    div.append(dt, dd);
    info.appendChild(div);
  });

  const corpo = noDetalhe("detalhe-parcelas");
  corpo.innerHTML = "";
  pags.forEach((p) => {
    const rotulo = rotuloPagamento(p, hoje);
    const tr = document.createElement("tr");
    tr.appendChild(criarCelula(p.TotalParcelas > 1 ? `${p.NumeroParcela}/${p.TotalParcelas}` : "Única"));
    tr.appendChild(criarCelula(moeda(p.Valor)));
    tr.appendChild(criarCelula(dataBR(p.Vencimento)));
    tr.appendChild(criarTag(rotulo.texto, rotulo.classe));
    tr.appendChild(criarCelula(p.DataPagamento ? dataBR(p.DataPagamento) : "—"));
    const tdAcao = document.createElement("td");
    if (p.Status === "Pendente") {
      tdAcao.appendChild(criarBotao("Dar baixa", "btn-mini", () => darBaixa(p.IDPagamento)));
    }
    tr.appendChild(tdAcao);
    corpo.appendChild(tr);
  });

  noDetalhe("zona-cancelar").hidden = !mat || mat.Status === "Inativa";
  detalhe.hidden = false;
}

noDetalhe("detalhe-fechar").addEventListener("click", fecharDetalhe);

// ===== US 4: Baixa manual de parcela =====
function darBaixa(idPagamento) {
  const pagamentos = lerTabela(CHAVES.pagamentos);
  const p = pagamentos.find((x) => x.IDPagamento === idPagamento);
  if (!p || p.Status !== "Pendente") return;

  p.Status = "Pago";
  p.DataPagamento = formatarData(new Date());
  p.IDRecepcionistaBaixa = ID_RECEPCIONISTA;
  salvarTabela(CHAVES.pagamentos, pagamentos);
  console.log("Baixa registrada (JSON):");
  console.log(JSON.stringify(p, null, 2));

  const parcela = p.TotalParcelas > 1 ? `Parcela ${p.NumeroParcela}/${p.TotalParcelas}` : "Pagamento único";
  abrirDetalhe(p.IDAluno, `${parcela} de ${moeda(p.Valor)} marcada como paga.`);
}

// ===== US 6: Cancelar matrícula =====
// Matrícula -> "Inativa"; parcelas pendentes que ainda não venceram -> "Cancelado".
// Parcelas já vencidas continuam pendentes (é dívida do período usado).
function cancelarMatricula(idAluno) {
  const hoje = formatarData(new Date());
  const matriculas = lerTabela(CHAVES.matriculas);
  const mat = matriculas.find((m) => m.IDAluno === idAluno && m.Status !== "Inativa");
  if (!mat) return null;

  mat.Status = "Inativa";
  mat.DataCancelamento = hoje;
  salvarTabela(CHAVES.matriculas, matriculas);

  const pagamentos = lerTabela(CHAVES.pagamentos);
  let canceladas = 0;
  pagamentos.forEach((p) => {
    if (p.IDAluno === idAluno && p.Status === "Pendente" && p.Vencimento >= hoje) {
      p.Status = "Cancelado";
      canceladas++;
    }
  });
  salvarTabela(CHAVES.pagamentos, pagamentos);
  return { matricula: mat, canceladas };
}

document.getElementById("btn-cancelar").addEventListener("click", async () => {
  const aluno = lerTabela(CHAVES.alunos).find((a) => a.IDAluno === alunoSelecionado);
  if (!aluno) return;
  const ok = await confirmar({
    titulo: `Cancelar a matrícula de ${aluno.Nome.split(" ")[0]}?`,
    texto: "A matrícula passa para Inativa e as parcelas futuras são canceladas. Parcelas já vencidas continuam em aberto.",
    botao: "Cancelar matrícula",
  });
  if (!ok) return;

  const resultado = cancelarMatricula(aluno.IDAluno);
  if (!resultado) return;
  console.log("Matrícula cancelada (JSON):");
  console.log(JSON.stringify(resultado, null, 2));

  abrirDetalhe(
    aluno.IDAluno,
    `Matrícula de ${aluno.Nome} cancelada. ${resultado.canceladas} parcela(s) futura(s) cancelada(s).`
  );
});

// ===== US 10: Relatório de faturas atrasadas do mês =====
const relMes = document.getElementById("rel-mes");
relMes.value = formatarData(new Date()).slice(0, 7);
relMes.addEventListener("change", renderizarRelatorio);
document.getElementById("rel-imprimir").addEventListener("click", () => window.print());

function diasEntre(isoInicio, isoFim) {
  const [a1, m1, d1] = isoInicio.split("-").map(Number);
  const [a2, m2, d2] = isoFim.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

function renderizarRelatorio() {
  const mes = relMes.value; // "YYYY-MM"
  const hoje = formatarData(new Date());
  const alunos = lerTabela(CHAVES.alunos);

  // Atrasada = pendente, vencimento dentro do mês escolhido e já passado
  const atrasadas = lerTabela(CHAVES.pagamentos).filter(
    (p) => p.Status === "Pendente" && p.Vencimento.startsWith(mes) && p.Vencimento < hoje
  );

  const porAluno = new Map();
  atrasadas.forEach((p) => {
    const item = porAluno.get(p.IDAluno) || { qtd: 0, valor: 0, maisAntigo: p.Vencimento };
    item.qtd++;
    item.valor += p.Valor;
    if (p.Vencimento < item.maisAntigo) item.maisAntigo = p.Vencimento;
    porAluno.set(p.IDAluno, item);
  });

  const linhas = [...porAluno.entries()]
    .map(([id, item]) => ({ aluno: alunos.find((a) => a.IDAluno === id), ...item }))
    .sort((a, b) => b.valor - a.valor);

  const total = atrasadas.reduce((s, p) => s + p.Valor, 0);
  document.getElementById("kpi-qtd").textContent = atrasadas.length;
  document.getElementById("kpi-valor").textContent = moeda(total);
  document.getElementById("kpi-alunos").textContent = linhas.length;
  document.querySelectorAll(".kpi").forEach((k) => k.classList.toggle("alerta", atrasadas.length > 0));

  // Barras: valor em atraso por aluno, relativo ao maior
  const barras = document.getElementById("rel-barras");
  barras.innerHTML = "";
  const maior = linhas[0]?.valor || 1;
  linhas.forEach((l) => {
    const linha = document.createElement("div");
    linha.className = "barra";
    const nome = document.createElement("span");
    nome.className = "barra-nome";
    nome.textContent = l.aluno ? l.aluno.Nome : "—";
    const trilho = document.createElement("div");
    trilho.className = "barra-trilho";
    const preenchida = document.createElement("div");
    preenchida.className = "barra-preenchida";
    preenchida.style.width = `${Math.max(4, (l.valor / maior) * 100)}%`;
    trilho.appendChild(preenchida);
    const valor = document.createElement("span");
    valor.className = "barra-valor";
    valor.textContent = moeda(l.valor);
    linha.append(nome, trilho, valor);
    barras.appendChild(linha);
  });
  document.getElementById("rel-vazio").hidden = linhas.length > 0;
  document.getElementById("rel-detalhe").hidden = linhas.length === 0;

  const corpo = document.getElementById("rel-tabela");
  corpo.innerHTML = "";
  linhas.forEach((l) => {
    const tr = document.createElement("tr");
    tr.appendChild(l.aluno ? criarCelulaPessoa(l.aluno.Nome) : criarCelula("—"));
    tr.appendChild(criarCelula(l.aluno ? formatarCpf(l.aluno.CPF) : "—"));
    tr.appendChild(criarCelula(l.aluno ? l.aluno.Email : "—"));
    tr.appendChild(criarCelula(String(l.qtd)));
    tr.appendChild(criarCelula(moeda(l.valor)));
    const dias = diasEntre(l.maisAntigo, hoje);
    tr.appendChild(criarTag(`${dias} dia${dias !== 1 ? "s" : ""}`, "tag-atrasado"));
    corpo.appendChild(tr);
  });
}

// ===== Dados de exemplo para testar US1–US10 =====
// Datas relativas a hoje, para sempre existir atraso, parcela em aberto e em dia.

// Gera CPF válido a partir de 9 dígitos (calcula os 2 verificadores)
function gerarCpf(base9) {
  const d = base9.split("").map(Number);
  const digito = (tam) => {
    let soma = 0;
    for (let i = 0; i < tam; i++) soma += d[i] * (tam + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  d.push(digito(9));
  d.push(digito(10));
  return d.join("");
}

const ALUNOS_DEMO = [
  // diasAtras: quando a matrícula começou; pagas: quantas parcelas já foram quitadas
  { base: "123456789", nome: "Ana Beatriz Costa",  plano: 2, forma: "parcelado", diasAtras: 40,  pagas: 1, cenario: "1 parcela atrasada, treinos A e B" },
  { base: "234567891", nome: "Bruno Henrique Lima", plano: 1, forma: "parcelado", diasAtras: 20,  pagas: 0, cenario: "mensal atrasada" },
  { base: "345678912", nome: "Carla Mendes",        plano: 3, forma: "parcelado", diasAtras: 100, pagas: 2, cenario: "2 parcelas atrasadas" },
  { base: "456789123", nome: "Diego Araújo",        plano: 4, forma: "avista",    diasAtras: 30,  pagas: 1, cenario: "anual à vista, em dia" },
  { base: "567891234", nome: "Eduarda Ferreira",    plano: 2, forma: "parcelado", diasAtras: 3,   pagas: 0, cenario: "recém-matriculada, em aberto" },
  { base: "678912345", nome: "Felipe Rocha",        plano: 1, forma: "parcelado", diasAtras: 50,  pagas: 1, cenario: "matrícula cancelada", cancelada: true },
  { base: "789123456", nome: "Gabriela Nunes",      plano: 3, forma: "parcelado", diasAtras: 10,  pagas: 1, cenario: "sem atraso, sem treino" },
];

const TREINOS_DEMO = [
  { nome: "Treino A - Peito e Tríceps", exercicios: ["Supino reto", "Supino inclinado", "Crucifixo", "Tríceps pulley", "Tríceps testa"] },
  { nome: "Treino B - Costas e Bíceps", exercicios: ["Puxada frontal", "Remada curvada", "Remada baixa", "Rosca direta", "Rosca martelo"] },
  { nome: "Treino C - Pernas e Abdômen", exercicios: ["Agachamento livre", "Leg press 45°", "Stiff", "Cadeira extensora", "Prancha"] },
];

const EXERCICIOS_DEMO = [
  { Nome: "Stiff",     Grupo: "Pernas", Equipamento: "Barra", Sugestao: "4 x 10" },
  { Nome: "Face pull", Grupo: "Ombros", Equipamento: "Polia", Sugestao: "3 x 15" },
];

// [aluno (índice em ALUNOS_DEMO), treino (índice em TREINOS_DEMO), ativa]
const ATRIBUICOES_DEMO = [
  [0, 0, true], [0, 1, true], [0, 2, false], // Ana: C foi inativado (US9)
  [1, 0, true],
  [2, 1, true],
  [3, 2, true],
  [4, 0, true],
];

function carregarDadosDemo() {
  const hoje = new Date();
  const hojeISO = formatarData(hoje);
  let id = Date.now();
  const novoId = () => ++id;

  const alunos = [];
  const matriculas = [];
  const pagamentos = [];

  ALUNOS_DEMO.forEach((d) => {
    const plano = PLANOS[d.plano];
    const inicio = somarDias(hoje, -d.diasAtras);
    const aluno = {
      IDAluno: novoId(),
      CPF: gerarCpf(d.base),
      Nome: d.nome,
      Email: `${normalizar(d.nome).split(" ")[0]}@email.com`,
      Endereco: "Rua das Flores, 100, Centro",
      DataInscricao: formatarData(inicio),
    };
    alunos.push(aluno);

    const mat = {
      IDMatricula: novoId(),
      IDAluno: aluno.IDAluno,
      IDPlano: plano.IDPlano,
      IDRecepcionista: ID_RECEPCIONISTA,
      DataInicio: formatarData(inicio),
      DataFim: formatarData(somarMeses(inicio, plano.DuracaoMeses)),
      Status: d.cancelada ? "Inativa" : "Ativa",
    };
    if (d.cancelada) mat.DataCancelamento = hojeISO;
    matriculas.push(mat);

    const n = d.forma === "avista" ? 1 : plano.DuracaoMeses;
    const primeiroVenc = somarDias(inicio, DIAS_VENCIMENTO);
    dividirEmParcelas(plano.Valor, n).forEach((valor, i) => {
      const venc = somarMeses(primeiroVenc, i);
      const p = {
        IDPagamento: novoId(),
        IDAluno: aluno.IDAluno,
        IDPlano: plano.IDPlano,
        NumeroParcela: i + 1,
        TotalParcelas: n,
        Valor: valor,
        Vencimento: formatarData(venc),
        Status: "Pendente",
      };
      if (i < d.pagas) {
        p.Status = "Pago";
        p.DataPagamento = formatarData(venc < hoje ? venc : hoje);
      } else if (d.cancelada && p.Vencimento >= hojeISO) {
        p.Status = "Cancelado";
      }
      pagamentos.push(p);
    });
  });

  const banco = [...EXERCICIOS, ...EXERCICIOS_DEMO];
  const exerciciosDemo = EXERCICIOS_DEMO.map((x) => ({
    IDExercicio: novoId(),
    IDProfessor: 1,
    ...x,
    DataCadastro: formatarData(somarDias(hoje, -30)),
  }));

  const treinos = TREINOS_DEMO.map((t, i) => ({
    IDTreino: novoId(),
    IDProfessor: ID_PROFESSOR,
    Nome: t.nome,
    DataCriacao: formatarData(somarDias(hoje, -25 + i)),
    Exercicios: t.exercicios.map((nome) => {
      const x = banco.find((e) => e.Nome === nome);
      return { Nome: x.Nome, Grupo: x.Grupo, Equipamento: x.Equipamento, Series: x.Sugestao };
    }),
  }));

  const atribuicoes = ATRIBUICOES_DEMO.map(([ia, it, ativa]) => {
    const a = {
      IDAtribuicao: novoId(),
      IDTreino: treinos[it].IDTreino,
      IDAluno: alunos[ia].IDAluno,
      DataAtribuicao: formatarData(somarDias(hoje, -20)),
      Status: ativa ? "Ativa" : "Inativa",
    };
    if (!ativa) a.DataInativacao = formatarData(somarDias(hoje, -5));
    return a;
  });

  salvarTabela(CHAVES.alunos, alunos);
  salvarTabela(CHAVES.matriculas, matriculas);
  salvarTabela(CHAVES.pagamentos, pagamentos);
  salvarTabela(CHAVES.exercicios, exerciciosDemo);
  salvarTabela(CHAVES.treinos, treinos);
  salvarTabela(CHAVES.atribuicoes, atribuicoes);

  return alunos.map((a, i) => ({ aluno: a, cenario: ALUNOS_DEMO[i].cenario }));
}

async function confirmarDemo() {
  if (lerTabela(CHAVES.alunos).length === 0) return true;
  return confirmar({
    titulo: "Carregar dados de exemplo?",
    texto: "Os dados salvos neste navegador serão substituídos por 7 alunos, 3 treinos e 2 exercícios de exemplo.",
    botao: "Carregar",
    perigo: false,
  });
}

document.getElementById("carregar-demo").addEventListener("click", async () => {
  if (!(await confirmarDemo())) return;

  const lista = document.getElementById("demo-cpfs");
  lista.innerHTML = "";
  carregarDadosDemo().forEach(({ aluno, cenario }) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "demo-cpf";
    const nome = document.createElement("span");
    nome.textContent = `${aluno.Nome.split(" ")[0]} · `;
    const desc = document.createElement("small");
    desc.textContent = cenario;
    nome.appendChild(desc);
    const cpf = document.createElement("code");
    cpf.textContent = formatarCpf(aluno.CPF);
    btn.append(nome, cpf);
    btn.title = "Preencher o CPF";
    btn.addEventListener("click", () => {
      selecionarPerfil("aluno");
      loginCpf.value = formatarCpf(aluno.CPF);
      loginCpf.focus();
    });
    li.appendChild(btn);
    lista.appendChild(li);
  });
  document.getElementById("demo-info").hidden = false;
});

// Mesmo carregamento, de dentro da recepção (sem precisar sair)
document.querySelectorAll(".js-carregar-demo").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (!(await confirmarDemo())) return;
    carregarDadosDemo();
    toast("Dados de exemplo carregados.");
    renderizarLista();
    renderizarBusca();
    renderizarRelatorio();
  });
});

// Restaura a sessão da aba (por último, para tudo já estar definido)
const sessaoAtual = lerSessao();
if (sessaoAtual && ROTULO_PERFIL[sessaoAtual.perfil]) entrarNoApp(sessaoAtual);
