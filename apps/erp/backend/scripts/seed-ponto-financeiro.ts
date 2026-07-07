/**
 * Seed de demonstração: 2 meses de batidas de ponto + jornadas para Financeiro.
 * Ambiente local/dev — NÃO usar em produção sem revisar.
 *
 * Uso:
 *   cd backend
 *   npx ts-node scripts/seed-ponto-financeiro.ts
 *
 * Variáveis opcionais:
 *   SEED_MESES=2026-04,2026-05
 *   SEED_TZ=America/Sao_Paulo
 */
import { OrigemPonto, Prisma, PrismaClient, RemuneracaoPontoTipo, TipoBatida } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  calcularHashAtual,
  gerarComprovanteId,
  obterUltimoHashCadeia,
  reservarProximoNsr,
} from '../src/common/utils/ponto-nsr.util';

const prisma = new PrismaClient();
const SEED_TAG = 'SEED_DEMO_PONTO';
const SENHA_PADRAO = 'senha123';

type Pattern = 'regular' | 'overtime' | 'mixed' | 'atrasos';

interface ColaboradorSeed {
  email: string;
  nome: string;
  remuneracao: RemuneracaoPontoTipo;
  valorHora?: number;
  valorMensal?: number;
  horarioFlexivel?: boolean;
  pattern: Pattern;
}

const COLABORADORES: ColaboradorSeed[] = [
  {
    email: 'admin@globaltec.com',
    nome: 'Administrador',
    remuneracao: RemuneracaoPontoTipo.MENSAL_META_HORAS,
    valorMensal: 6500,
    pattern: 'regular',
  },
  {
    email: 'supervisor@globaltec.com',
    nome: 'Supervisor Exemplo',
    remuneracao: RemuneracaoPontoTipo.VALOR_HORA,
    valorHora: 55,
    pattern: 'overtime',
  },
  {
    email: 'executor@globaltec.com',
    nome: 'Executor Exemplo',
    remuneracao: RemuneracaoPontoTipo.VALOR_HORA,
    valorHora: 38,
    pattern: 'mixed',
  },
  {
    email: 'maria.costa@globaltec.com',
    nome: 'Maria Costa',
    remuneracao: RemuneracaoPontoTipo.MENSAL_META_HORAS,
    valorMensal: 4200,
    pattern: 'atrasos',
  },
  {
    email: 'joao.silva@globaltec.com',
    nome: 'João Silva',
    remuneracao: RemuneracaoPontoTipo.VALOR_HORA,
    valorHora: 32,
    horarioFlexivel: true,
    pattern: 'regular',
  },
];

function parseMeses(): string[] {
  const raw = process.env.SEED_MESES?.trim();
  if (raw) {
    return raw.split(',').map((m) => m.trim()).filter(Boolean);
  }
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  return [prev, cur];
}

function diasUteisNoMes(ym: string, ateDia?: number): Date[] {
  const [y, m] = ym.split('-').map(Number);
  const last = ateDia ?? new Date(y, m, 0).getDate();
  const out: Date[] = [];
  for (let d = 1; d <= last; d++) {
    const dt = new Date(y, m - 1, d);
    const dow = dt.getDay();
    if (dow >= 1 && dow <= 5) out.push(dt);
  }
  return out;
}

function horarioLocal(dia: Date, hh: number, mm: number): Date {
  return new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), hh, mm, 0, 0);
}

function metaHorasMensalMin(cargaSemanalMin: number): number {
  return Math.round((cargaSemanalMin * 52) / 12);
}

async function criarBatida(input: {
  usuarioId: number;
  tipo: TipoBatida;
  dataHora: Date;
}) {
  return prisma.$transaction(
    async (tx) => {
      const nsr = await reservarProximoNsr(tx);
      const hashAnterior = await obterUltimoHashCadeia(tx);
      const hashAtual = calcularHashAtual({
        nsr,
        usuarioId: input.usuarioId,
        tipo: input.tipo,
        dataHora: input.dataHora,
        origem: OrigemPonto.NORMAL,
        hashAnterior,
      });
      return tx.registroPonto.create({
        data: {
          usuarioId: input.usuarioId,
          tipo: input.tipo,
          dataHora: input.dataHora,
          origem: OrigemPonto.NORMAL,
          observacao: SEED_TAG,
          nsr,
          hashAnterior,
          hashAtual,
          comprovanteId: gerarComprovanteId(),
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

function batidasDoDia(dia: Date, pattern: Pattern, idx: number): Array<{ tipo: TipoBatida; h: number; m: number }> | null {
  if (pattern === 'mixed' && idx % 11 === 0) return null;
  if (pattern === 'atrasos' && idx % 9 === 0) return null;

  const entradaH = pattern === 'atrasos' && idx % 4 === 0 ? 8 : pattern === 'atrasos' ? 8 : 8;
  const entradaM = pattern === 'atrasos' && idx % 4 === 0 ? 25 : pattern === 'overtime' && idx % 3 === 0 ? 7 : 5;

  if (pattern === 'mixed' && idx % 7 === 0) {
    return [{ tipo: TipoBatida.ENTRADA, h: entradaH, m: entradaM }];
  }

  const saidaH = pattern === 'overtime' && idx % 2 === 0 ? 18 : pattern === 'overtime' ? 17 : 17;
  const saidaM = pattern === 'overtime' && idx % 2 === 0 ? 30 : 5;

  return [
    { tipo: TipoBatida.ENTRADA, h: entradaH, m: entradaM },
    { tipo: TipoBatida.SAIDA, h: saidaH, m: saidaM },
  ];
}

async function ensureColaborador(colab: ColaboradorSeed, cargoExecutorId: number) {
  const senha = await bcrypt.hash(SENHA_PADRAO, 10);
  const usuario = await prisma.usuario.upsert({
    where: { email: colab.email },
    update: { nome: colab.nome, ativo: true },
    create: {
      nome: colab.nome,
      email: colab.email,
      senha,
      cargoId: cargoExecutorId,
      ativo: true,
    },
  });

  const cargaSemanalMin = 2400;
  const meta = metaHorasMensalMin(cargaSemanalMin);

  await prisma.jornadaTrabalho.upsert({
    where: { usuarioId: usuario.id },
    update: {
      controlePonto: true,
      horarioFlexivel: colab.horarioFlexivel ?? false,
      remuneracaoPontoTipo: colab.remuneracao,
      valorHora: colab.valorHora ?? null,
      valorMensal: colab.valorMensal ?? null,
      metaHorasMensalMin: colab.remuneracao === RemuneracaoPontoTipo.MENSAL_META_HORAS ? meta : null,
      cargaDiariaMin: 480,
      cargaSemanalMin,
      inicioPadrao: '08:00',
      fimPadrao: '17:00',
      almocoAutomatico: true,
      almocoInicio: '12:00',
      almocoFim: '13:00',
    },
    create: {
      usuarioId: usuario.id,
      controlePonto: true,
      horarioFlexivel: colab.horarioFlexivel ?? false,
      remuneracaoPontoTipo: colab.remuneracao,
      valorHora: colab.valorHora ?? null,
      valorMensal: colab.valorMensal ?? null,
      metaHorasMensalMin: colab.remuneracao === RemuneracaoPontoTipo.MENSAL_META_HORAS ? meta : null,
      cargaDiariaMin: 480,
      cargaSemanalMin,
      inicioPadrao: '08:00',
      fimPadrao: '17:00',
      almocoAutomatico: true,
      almocoInicio: '12:00',
      almocoFim: '13:00',
    },
  });

  return usuario.id;
}

async function main() {
  const meses = parseMeses();
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  console.log('🌱 Seed ponto + financeiro (2 meses)');
  console.log(`   Meses: ${meses.join(', ')}`);

  const cargo =
    (await prisma.cargo.findFirst({ where: { nome: 'EXECUTOR' } })) ??
    (await prisma.cargo.findFirst({ where: { ativo: true } }));
  if (!cargo) throw new Error('Nenhum cargo encontrado. Rode prisma/seed.ts antes.');

  const removidos = await prisma.registroPonto.deleteMany({
    where: { observacao: SEED_TAG },
  });
  console.log(`   Batidas demo anteriores removidas: ${removidos.count}`);

  const usuarioIds: Array<{ id: number; pattern: Pattern; email: string }> = [];
  for (const c of COLABORADORES) {
    const id = await ensureColaborador(c, cargo.id);
    usuarioIds.push({ id, pattern: c.pattern, email: c.email });
    console.log(`   ✓ Jornada/ponto: ${c.nome} (${c.email})`);
  }

  let totalBatidas = 0;
  for (const ym of meses) {
    const ateDia = ym === mesAtual ? hoje.getDate() : undefined;
    const dias = diasUteisNoMes(ym, ateDia);
    console.log(`\n📅 ${ym} — ${dias.length} dias úteis`);

    for (const { id, pattern, email } of usuarioIds) {
      let diaIdx = 0;
      for (const dia of dias) {
        const slots = batidasDoDia(dia, pattern, diaIdx);
        diaIdx++;
        if (!slots) continue;
        for (const s of slots) {
          await criarBatida({
            usuarioId: id,
            tipo: s.tipo,
            dataHora: horarioLocal(dia, s.h, s.m),
          });
          totalBatidas++;
        }
      }
      console.log(`      ${email}: batidas geradas`);
    }
  }

  console.log(`\n✅ Concluído: ${totalBatidas} batidas para ${usuarioIds.length} colaboradores.`);
  console.log('\n📋 Teste no sistema:');
  console.log('   • RH > Espelho / Banco de horas — meses:', meses.join(', '));
  console.log('   • Financeiro > Planejamento ponto — mesmo período');
  console.log('   • Logins (senha: senha123):');
  for (const c of COLABORADORES) {
    console.log(`     - ${c.email}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Falha no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
