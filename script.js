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
  localStorage.setItem(chave, JSON.stringify(tabela));
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

  const pagamento = {
    IDPagamento: Date.now() + 1,
    IDAluno: idAluno,
    IDPlano: plano.IDPlano,
    Valor: plano.Valor,
    Vencimento: formatarData(somarDias(hoje, DIAS_VENCIMENTO)),
    Status: "Pendente",
  };

  salvarRegistro(CHAVES.alunos, aluno);
  salvarRegistro(CHAVES.matriculas, matricula);
  salvarRegistro(CHAVES.pagamentos, pagamento);

  return { aluno, matricula, pagamento };
}

// ===== Interface =====
const form = document.getElementById("form-aluno");
const erro = document.getElementById("erro");

// Máscara simples de CPF enquanto digita
document.getElementById("cpf").addEventListener("input", (e) => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const dados = {
    cpf: form.cpf.value.trim(),
    nome: form.nome.value.trim(),
    email: form.email.value.trim(),
    endereco: form.endereco.value.trim(),
    plano: form.plano.value,
  };

  const mensagemErro = validar(dados);
  if (mensagemErro) {
    erro.textContent = mensagemErro;
    erro.hidden = false;
    return;
  }
  erro.hidden = true;

  const resultado = cadastrarAluno(dados);

  console.log("Cadastro gerado (JSON):");
  console.log(JSON.stringify(resultado, null, 2));

  alert(
    `Aluno cadastrado com sucesso!\n\n` +
    `Matrícula ativa até ${resultado.matricula.DataFim}.\n` +
    `Primeiro pagamento: R$ ${resultado.pagamento.Valor},00 ` +
    `(vence em ${resultado.pagamento.Vencimento}).`
  );

  form.reset();
});
