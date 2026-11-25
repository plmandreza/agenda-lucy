-- =====================================================================
--  LUCY CABELEIREIRA — Ajustes com as respostas da Lucy (23/11/2026)
--
--  Rode UMA VEZ, depois do banco.sql (SQL Editor > colar > "Run").
--  Daqui para a frente, essas informações serão mudadas pelo painel.
--  Atenção: rodar de novo depois que a Lucy editar no painel
--  apagaria as edições dela, voltando para os valores abaixo.
-- =====================================================================

-- Cancelamento: a cliente pode cancelar até no mesmo dia
-- (0 = qualquer momento antes do horário marcado).
update configuracoes set antecedencia_cancelamento_horas = 0, atualizado_em = now()
where id = 1;

-- Todos os dias, das 8h às 18h. O serviço precisa TERMINAR até as 18h.
update horarios_funcionamento
set trabalha = true, abre = '08:00', fecha = '18:00', pausa_inicio = null, pausa_fim = null;

-- Durações: "1h pelo menos, alguns até 3h".
-- Tintura ficou com 3h por ser o serviço mais demorado; os outros, com 1h.
update servicos set duracao_min = 60
  where nome in ('Corte feminino', 'Corte masculino', 'Sobrancelha (design e tintura)',
                 'Escova simples', 'Hidratação / tratamento capilar');
update servicos set duracao_min = 180 where nome = 'Tintura';

-- De quantos em quantos dias a cliente costuma voltar (para a lista de retornos):
-- tintura "a cada 1 mês ou perto disso"; corte "a cada 2 ou 3 meses"
-- (usamos 2 meses, para a lista avisar com tempo).
update servicos set retorno_dias = 30 where nome = 'Tintura';
update servicos set retorno_dias = 60 where nome in ('Corte feminino', 'Corte masculino');

-- PREÇOS SIMULADOS (a Lucy troca pelos reais no painel).
update servicos set preco = 60.00  where nome = 'Corte feminino';
update servicos set preco = 40.00  where nome = 'Corte masculino';
update servicos set preco = 120.00 where nome = 'Tintura';
update servicos set preco = 40.00  where nome = 'Sobrancelha (design e tintura)';
update servicos set preco = 50.00  where nome = 'Escova simples';
update servicos set preco = 80.00  where nome = 'Hidratação / tratamento capilar';

-- Conferência: mostra como ficou.
select nome, duracao_min as minutos, retorno_dias as volta_em_dias, preco
from servicos order by ordem;
