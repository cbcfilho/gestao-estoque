-- =============================================================================
-- 0016_reduz_superficie_do_authenticated.sql — Fecha o que o usuário logado
-- nunca precisou chamar
--
-- A 0015 tirou o visitante de cima das funções SECURITY DEFINER. Sobraram 34
-- alcançáveis pelo papel `authenticated`, e a maioria é a própria arquitetura:
-- toda escrita de estoque passa por RPC, então fn_registrar_saida e companhia
-- PRECISAM ser chamáveis por quem está logado. Nove não se encaixam nisso.
--
-- O que sai e por quê
-- -------------------
-- fn_criar_tarefa_sistema     nenhuma tela chama; só é usada por dentro do cron.
--                             Exposta, deixava qualquer usuário logado inventar
--                             tarefa de sistema pela API REST.
-- fn_responsavel_padrao_filial devolve id de usuário; nenhuma tela chama.
-- auth_exige_permissao        }  só fazem sentido DENTRO das funções de escrita,
-- auth_exige_filial           }  onde rodam como o dono. Chamadas de fora, o
--                                máximo que fazem é levantar erro — mas não há
--                                motivo para estarem no caminho.
-- fn_novo_usuario_auth        }
-- fn_notificar_tarefa         }  funções de GATILHO. Não são para chamada
-- fn_notificar_atraso         }  direta: o Postgres recusa executá-las fora de
-- fn_sincroniza_ultimo_acesso }  um gatilho.
-- fn_concluir_tarefas_do_inventario
--
-- Por que revogar de gatilho não quebra o gatilho
-- -----------------------------------------------
-- O Postgres checa EXECUTE na CRIAÇÃO do gatilho, não a cada disparo. Isso
-- importa aqui de verdade: `tarefas` é gravada direto pela tela (não por RPC),
-- então fn_notificar_tarefa e fn_notificar_atraso disparam com o papel
-- `authenticated` em vigor. Se a checagem fosse por disparo, esta migration
-- quebraria a criação de tarefa em produção. A suíte cobre exatamente esse
-- caminho: cria uma tarefa como `authenticated` e confere que a notificação
-- nasceu, com a revogação já aplicada.
--
-- O que continua de pé: as 20 RPCs que as telas chamam, as 5 auxiliares usadas
-- nas policies de RLS (0015) e tudo do service_role.
-- =============================================================================

-- Lista explícita de propósito, ao contrário da varredura da 0015: aqui o ponto
-- é justamente que estas nove são exceção e as outras vinte e cinco não são.
-- Uma varredura esconderia a decisão; a lista obriga a justificar cada inclusão.

revoke execute on function
  fn_criar_tarefa_sistema(text, text, categoria_tarefa, uuid, date, prioridade_tarefa, text, text),
  fn_responsavel_padrao_filial(uuid),
  auth_exige_permissao(text),
  auth_exige_filial(uuid),
  fn_novo_usuario_auth(),
  fn_notificar_tarefa(),
  fn_notificar_atraso(),
  fn_sincroniza_ultimo_acesso(),
  fn_concluir_tarefas_do_inventario()
  from authenticated;
