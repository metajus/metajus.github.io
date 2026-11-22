// ============================================================
// CONFIGURAÇÃO DO METAJUS
// ------------------------------------------------------------
// Cole aqui a URL e a chave "anon public" do seu projeto Supabase
// (Supabase > Project Settings > API).
//
// A chave "anon" é feita para ficar no navegador: a proteção real
// está nas regras de segurança (RLS) criadas pelo arquivo
// supabase/schema.sql. NUNCA coloque aqui a chave "service_role".
//
// Enquanto os dois campos estiverem vazios, o app roda em
// MODO DEMONSTRAÇÃO (dados só no aparelho, para testar as telas).
// ============================================================
window.METAJUS_CONFIG = {
  SUPABASE_URL: 'https://tfwchbdtqpzyaohwvbdk.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_riODtbq4isv1sxXfqKdbxQ_4RkFIt7c',

  // Endereço oficial do app (usado no QR Code e no "Copiar link")
  APP_URL: 'https://metajus.github.io/',

  NOME_UNIDADE: 'Comarca de Santa Luzia do Norte',

  // Faixas de dias parados exibidas no app
  FAIXAS: [30, 60, 100, 120, 180, 365],

  // Especialidades / frentes de trabalho
  ESPECIALIDADES: ['Geral', 'Réu Preso', 'Saúde', 'SEEU'],

  // Tipos de diligência para o Repasse
  DILIGENCIAS: ['SISBAJUD', 'RENAJUD', 'INFOJUD', 'SNIPER', 'CNIB', 'Ofício', 'Mandado', 'Outro'],

  // Urgências usadas nos comandos do Gabinete
  URGENCIAS: ['Normal', 'Urgente', 'Réu Preso', 'Saúde', 'Medida Protetiva']
};
