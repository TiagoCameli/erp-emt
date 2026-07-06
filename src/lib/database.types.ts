export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abastecimentos: {
        Row: {
          created_at: string
          created_by: string | null
          custo_total: number | null
          data_abastecimento: string
          deposito_id: string
          equipamento_id: string
          horimetro: number | null
          id: string
          insumo_id: string
          km: number | null
          movimento_id: string | null
          observacao: string | null
          operador_id: string | null
          quantidade: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custo_total?: number | null
          data_abastecimento?: string
          deposito_id: string
          equipamento_id: string
          horimetro?: number | null
          id?: string
          insumo_id: string
          km?: number | null
          movimento_id?: string | null
          observacao?: string | null
          operador_id?: string | null
          quantidade: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custo_total?: number | null
          data_abastecimento?: string
          deposito_id?: string
          equipamento_id?: string
          horimetro?: number | null
          id?: string
          insumo_id?: string
          km?: number | null
          movimento_id?: string | null
          observacao?: string | null
          operador_id?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "abastecimentos_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "estoque_movimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      anexos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          nome_arquivo: string
          path_storage: string
          registro_id: string
          tabela: string
          tamanho_bytes: number | null
          tipo_mime: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          nome_arquivo: string
          path_storage: string
          registro_id: string
          tabela: string
          tamanho_bytes?: number | null
          tipo_mime?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          nome_arquivo?: string
          path_storage?: string
          registro_id?: string
          tabela?: string
          tamanho_bytes?: number | null
          tipo_mime?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          acao: string
          criado_em: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: number
          registro_id: string | null
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: never
          registro_id?: string | null
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: never
          registro_id?: string | null
          tabela?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      banco_horas_movimentos: {
        Row: {
          colaborador_id: string
          created_at: string
          created_by: string | null
          data: string
          horas: number
          id: string
          motivo: string | null
          observacao: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          horas: number
          id?: string
          motivo?: string | null
          observacao?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          horas?: number
          id?: string
          motivo?: string | null
          observacao?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banco_horas_movimentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_financeiras: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          nome: string
          pai_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          pai_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          pai_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_pai_id_fkey"
            columns: ["pai_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_insumo: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      centros_custo: {
        Row: {
          ativo: boolean
          codigo: string | null
          created_at: string
          created_by: string | null
          equipamento_id: string | null
          id: string
          nivel: number
          nome: string
          obra_id: string | null
          orcamento: number | null
          pai_id: string | null
          sistema: boolean
          tipo: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          equipamento_id?: string | null
          id?: string
          nivel: number
          nome: string
          obra_id?: string | null
          orcamento?: number | null
          pai_id?: string | null
          sistema?: boolean
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          equipamento_id?: string | null
          id?: string
          nivel?: number
          nome?: string
          obra_id?: string | null
          orcamento?: number | null
          pai_id?: string | null
          sistema?: boolean
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "centros_custo_equipamento_fk"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "centros_custo_obra_fk"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "centros_custo_pai_id_fkey"
            columns: ["pai_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_execucoes: {
        Row: {
          checklist_id: string
          created_at: string
          created_by: string | null
          data: string
          equipamento_id: string
          horimetro: number | null
          id: string
          km: number | null
          observacao: string | null
          operador_id: string | null
          status: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          equipamento_id: string
          horimetro?: number | null
          id?: string
          km?: number | null
          observacao?: string | null
          operador_id?: string | null
          status?: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          equipamento_id?: string
          horimetro?: number | null
          id?: string
          km?: number | null
          observacao?: string | null
          operador_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_execucoes_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucoes_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_perguntas: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          ordem: number
          pergunta: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          ordem?: number
          pergunta: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          ordem?: number
          pergunta?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_perguntas_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_respostas: {
        Row: {
          created_at: string
          execucao_id: string
          id: string
          observacao: string | null
          os_id: string | null
          pergunta_id: string
          resposta: string
        }
        Insert: {
          created_at?: string
          execucao_id: string
          id?: string
          observacao?: string | null
          os_id?: string | null
          pergunta_id: string
          resposta: string
        }
        Update: {
          created_at?: string
          execucao_id?: string
          id?: string
          observacao?: string | null
          os_id?: string | null
          pergunta_id?: string
          resposta?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_respostas_execucao_id_fkey"
            columns: ["execucao_id"]
            isOneToOne: false
            referencedRelation: "checklist_execucoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_respostas_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_respostas_pergunta_id_fkey"
            columns: ["pergunta_id"]
            isOneToOne: false
            referencedRelation: "checklist_perguntas"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ativo: boolean
          cidade: string | null
          cpf_cnpj: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          nome: string
          nome_fantasia: string | null
          observacoes: string | null
          telefone: string | null
          tipo: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome: string
          nome_fantasia?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo?: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          telefone?: string | null
          tipo?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      colaboradores: {
        Row: {
          ativo: boolean
          centro_custo_id: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          data_admissao: string | null
          funcao: string | null
          id: string
          nome: string
          obra_id: string | null
          salario: number | null
          telefone: string | null
          updated_at: string
          valor_diaria: number | null
          vinculo: string
        }
        Insert: {
          ativo?: boolean
          centro_custo_id?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string | null
          funcao?: string | null
          id?: string
          nome: string
          obra_id?: string | null
          salario?: number | null
          telefone?: string | null
          updated_at?: string
          valor_diaria?: number | null
          vinculo?: string
        }
        Update: {
          ativo?: boolean
          centro_custo_id?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_admissao?: string | null
          funcao?: string | null
          id?: string
          nome?: string
          obra_id?: string | null
          salario?: number | null
          telefone?: string | null
          updated_at?: string
          valor_diaria?: number | null
          vinculo?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "colaboradores_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          chave: string
          descricao: string | null
          updated_at: string
          updated_by: string | null
          valor: Json
        }
        Insert: {
          chave: string
          descricao?: string | null
          updated_at?: string
          updated_by?: string | null
          valor: Json
        }
        Update: {
          chave?: string
          descricao?: string | null
          updated_at?: string
          updated_by?: string | null
          valor?: Json
        }
        Relationships: []
      }
      contas_bancarias: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string
          conta: string | null
          created_at: string
          created_by: string | null
          id: string
          nome: string
          saldo_inicial: number
          tipo: string
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string
          conta?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string
          conta?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      cotacao_fornecedores: {
        Row: {
          condicao_pagamento: string | null
          cotacao_id: string
          created_at: string
          created_by: string | null
          fornecedor_id: string
          id: string
          observacao: string | null
          prazo_entrega_dias: number | null
        }
        Insert: {
          condicao_pagamento?: string | null
          cotacao_id: string
          created_at?: string
          created_by?: string | null
          fornecedor_id: string
          id?: string
          observacao?: string | null
          prazo_entrega_dias?: number | null
        }
        Update: {
          condicao_pagamento?: string | null
          cotacao_id?: string
          created_at?: string
          created_by?: string | null
          fornecedor_id?: string
          id?: string
          observacao?: string | null
          prazo_entrega_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_fornecedores_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_fornecedores_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacao_itens: {
        Row: {
          cotacao_fornecedor_id: string
          cotacao_id: string
          created_at: string
          created_by: string | null
          id: string
          insumo_id: string
          preco_unitario: number
          quantidade: number
        }
        Insert: {
          cotacao_fornecedor_id: string
          cotacao_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_id: string
          preco_unitario: number
          quantidade: number
        }
        Update: {
          cotacao_fornecedor_id?: string
          cotacao_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_id?: string
          preco_unitario?: number
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "cotacao_itens_cotacao_fornecedor_id_fkey"
            columns: ["cotacao_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "cotacao_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_itens_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacao_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          motivo_selecao: string | null
          numero: string | null
          observacoes: string | null
          pedido_id: string | null
          status: string
          updated_at: string
          vencedor_fornecedor_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          motivo_selecao?: string | null
          numero?: string | null
          observacoes?: string | null
          pedido_id?: string | null
          status?: string
          updated_at?: string
          vencedor_fornecedor_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          motivo_selecao?: string | null
          numero?: string | null
          observacoes?: string | null
          pedido_id?: string | null
          status?: string
          updated_at?: string
          vencedor_fornecedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacoes_vencedor_fornecedor_id_fkey"
            columns: ["vencedor_fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      depositos: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          insumo_id: string | null
          nome: string
          obra_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_id?: string | null
          nome: string
          obra_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_id?: string | null
          nome?: string
          obra_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "depositos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depositos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_sequencias: {
        Row: {
          ano: number
          proximo: number
          tipo: string
        }
        Insert: {
          ano: number
          proximo?: number
          tipo: string
        }
        Update: {
          ano?: number
          proximo?: number
          tipo?: string
        }
        Relationships: []
      }
      equipamento_documentos: {
        Row: {
          anexo_path: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          equipamento_id: string
          id: string
          tipo: string
          updated_at: string
          vencimento: string | null
        }
        Insert: {
          anexo_path?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          equipamento_id: string
          id?: string
          tipo: string
          updated_at?: string
          vencimento?: string | null
        }
        Update: {
          anexo_path?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          equipamento_id?: string
          id?: string
          tipo?: string
          updated_at?: string
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipamento_documentos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamento_planos: {
        Row: {
          ativo: boolean
          base_data: string
          base_horimetro: number | null
          base_km: number | null
          created_at: string
          created_by: string | null
          equipamento_id: string
          id: string
          plano_id: string
        }
        Insert: {
          ativo?: boolean
          base_data?: string
          base_horimetro?: number | null
          base_km?: number | null
          created_at?: string
          created_by?: string | null
          equipamento_id: string
          id?: string
          plano_id: string
        }
        Update: {
          ativo?: boolean
          base_data?: string
          base_horimetro?: number | null
          base_km?: number | null
          created_at?: string
          created_by?: string | null
          equipamento_id?: string
          id?: string
          plano_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipamento_planos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipamento_planos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_preventivos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          ano: number | null
          ativo: boolean
          codigo: string | null
          controle_por: string
          created_at: string
          created_by: string | null
          descricao: string
          id: string
          marca: string | null
          modelo: string | null
          placa: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          ano?: number | null
          ativo?: boolean
          codigo?: string | null
          controle_por?: string
          created_at?: string
          created_by?: string | null
          descricao: string
          id?: string
          marca?: string | null
          modelo?: string | null
          placa?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          ano?: number | null
          ativo?: boolean
          codigo?: string | null
          controle_por?: string
          created_at?: string
          created_by?: string | null
          descricao?: string
          id?: string
          marca?: string | null
          modelo?: string | null
          placa?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      estoque_camadas: {
        Row: {
          created_at: string
          custo_unitario: number
          data_entrada: string
          deposito_id: string
          id: string
          insumo_id: string
          movimento_id: string | null
          quantidade_inicial: number
          quantidade_restante: number
          sequencia: number
        }
        Insert: {
          created_at?: string
          custo_unitario: number
          data_entrada: string
          deposito_id: string
          id?: string
          insumo_id: string
          movimento_id?: string | null
          quantidade_inicial: number
          quantidade_restante: number
          sequencia?: never
        }
        Update: {
          created_at?: string
          custo_unitario?: number
          data_entrada?: string
          deposito_id?: string
          id?: string
          insumo_id?: string
          movimento_id?: string | null
          quantidade_inicial?: number
          quantidade_restante?: number
          sequencia?: never
        }
        Relationships: [
          {
            foreignKeyName: "estoque_camadas_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_camadas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_camadas_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "estoque_movimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_minimos: {
        Row: {
          created_at: string
          created_by: string | null
          deposito_id: string
          id: string
          insumo_id: string
          minimo: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deposito_id: string
          id?: string
          insumo_id: string
          minimo?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deposito_id?: string
          id?: string
          insumo_id?: string
          minimo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_minimos_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_minimos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_movimentos: {
        Row: {
          centro_custo_id: string | null
          created_at: string
          created_by: string | null
          custo_total: number | null
          custo_unitario: number | null
          data_movimento: string
          deposito_destino_id: string | null
          deposito_id: string
          equipamento_id: string | null
          id: string
          insumo_id: string
          observacao: string | null
          origem: string
          origem_id: string | null
          quantidade: number
          tipo: string
        }
        Insert: {
          centro_custo_id?: string | null
          created_at?: string
          created_by?: string | null
          custo_total?: number | null
          custo_unitario?: number | null
          data_movimento?: string
          deposito_destino_id?: string | null
          deposito_id: string
          equipamento_id?: string | null
          id?: string
          insumo_id: string
          observacao?: string | null
          origem?: string
          origem_id?: string | null
          quantidade: number
          tipo: string
        }
        Update: {
          centro_custo_id?: string | null
          created_at?: string
          created_by?: string | null
          custo_total?: number | null
          custo_unitario?: number | null
          data_movimento?: string
          deposito_destino_id?: string | null
          deposito_id?: string
          equipamento_id?: string | null
          id?: string
          insumo_id?: string
          observacao?: string | null
          origem?: string
          origem_id?: string | null
          quantidade?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_deposito_destino_id_fkey"
            columns: ["deposito_destino_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimentos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_saldos: {
        Row: {
          atualizado_em: string
          deposito_id: string
          insumo_id: string
          quantidade: number
          valor_total: number
        }
        Insert: {
          atualizado_em?: string
          deposito_id: string
          insumo_id: string
          quantidade?: number
          valor_total?: number
        }
        Update: {
          atualizado_em?: string
          deposito_id?: string
          insumo_id?: string
          quantidade?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_saldos_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_saldos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      extrato_transacoes: {
        Row: {
          chave_dedup: string | null
          conciliada: boolean
          conciliado_em: string | null
          conciliado_por: string | null
          conta_bancaria_id: string
          created_at: string
          data_movimento: string
          extrato_id: string
          fitid: string | null
          id: string
          memo: string | null
          parcela_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          chave_dedup?: string | null
          conciliada?: boolean
          conciliado_em?: string | null
          conciliado_por?: string | null
          conta_bancaria_id: string
          created_at?: string
          data_movimento: string
          extrato_id: string
          fitid?: string | null
          id?: string
          memo?: string | null
          parcela_id?: string | null
          tipo: string
          valor: number
        }
        Update: {
          chave_dedup?: string | null
          conciliada?: boolean
          conciliado_em?: string | null
          conciliado_por?: string | null
          conta_bancaria_id?: string
          created_at?: string
          data_movimento?: string
          extrato_id?: string
          fitid?: string | null
          id?: string
          memo?: string | null
          parcela_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "extrato_transacoes_conciliado_por_fkey"
            columns: ["conciliado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_transacoes_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_transacoes_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "extratos_ofx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extrato_transacoes_parcela_id_fkey"
            columns: ["parcela_id"]
            isOneToOne: false
            referencedRelation: "lancamento_parcelas"
            referencedColumns: ["id"]
          },
        ]
      }
      extratos_ofx: {
        Row: {
          conta_bancaria_id: string
          created_at: string
          created_by: string | null
          id: string
          importado_em: string
          nome_arquivo: string | null
          periodo_fim: string | null
          periodo_inicio: string | null
        }
        Insert: {
          conta_bancaria_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          importado_em?: string
          nome_arquivo?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
        }
        Update: {
          conta_bancaria_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          importado_em?: string
          nome_arquivo?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extratos_ofx_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
        ]
      }
      faturas: {
        Row: {
          cliente_id: string | null
          competencia: string
          created_at: string
          created_by: string | null
          data_vencimento: string | null
          id: string
          lancamento_id: string | null
          medicao_id: string | null
          numero: string | null
          obra_id: string
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          cliente_id?: string | null
          competencia: string
          created_at?: string
          created_by?: string | null
          data_vencimento?: string | null
          id?: string
          lancamento_id?: string | null
          medicao_id?: string | null
          numero?: string | null
          obra_id: string
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          cliente_id?: string | null
          competencia?: string
          created_at?: string
          created_by?: string | null
          data_vencimento?: string | null
          id?: string
          lancamento_id?: string | null
          medicao_id?: string | null
          numero?: string | null
          obra_id?: string
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      folha_itens: {
        Row: {
          adiantamentos: number
          centro_custo_id: string | null
          colaborador_id: string
          created_at: string
          custo_total: number
          encargos: number
          folha_id: string
          horas_extras: number
          horas_normais: number
          id: string
          salario_base: number
          valor_extras: number
          valor_liquido: number
        }
        Insert: {
          adiantamentos?: number
          centro_custo_id?: string | null
          colaborador_id: string
          created_at?: string
          custo_total?: number
          encargos?: number
          folha_id: string
          horas_extras?: number
          horas_normais?: number
          id?: string
          salario_base?: number
          valor_extras?: number
          valor_liquido?: number
        }
        Update: {
          adiantamentos?: number
          centro_custo_id?: string | null
          colaborador_id?: string
          created_at?: string
          custo_total?: number
          encargos?: number
          folha_id?: string
          horas_extras?: number
          horas_normais?: number
          id?: string
          salario_base?: number
          valor_extras?: number
          valor_liquido?: number
        }
        Relationships: [
          {
            foreignKeyName: "folha_itens_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_itens_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folha_itens_folha_id_fkey"
            columns: ["folha_id"]
            isOneToOne: false
            referencedRelation: "folhas"
            referencedColumns: ["id"]
          },
        ]
      }
      folhas: {
        Row: {
          competencia: string
          created_at: string
          created_by: string | null
          custo_total: number
          data_fechamento: string | null
          encargos_percentual: number
          id: string
          status: string
          updated_at: string
          valor_adiantamentos: number
          valor_bruto: number
          valor_encargos: number
          valor_liquido: number
        }
        Insert: {
          competencia: string
          created_at?: string
          created_by?: string | null
          custo_total?: number
          data_fechamento?: string | null
          encargos_percentual?: number
          id?: string
          status?: string
          updated_at?: string
          valor_adiantamentos?: number
          valor_bruto?: number
          valor_encargos?: number
          valor_liquido?: number
        }
        Update: {
          competencia?: string
          created_at?: string
          created_by?: string | null
          custo_total?: number
          data_fechamento?: string | null
          encargos_percentual?: number
          id?: string
          status?: string
          updated_at?: string
          valor_adiantamentos?: number
          valor_bruto?: number
          valor_encargos?: number
          valor_liquido?: number
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          ativo: boolean
          cidade: string | null
          cnpj_cpf: string | null
          created_at: string
          created_by: string | null
          email: string | null
          endereco: string | null
          id: string
          inscricao_estadual: string | null
          nome_fantasia: string | null
          observacoes: string | null
          razao_social: string
          telefone: string | null
          tipo: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          cnpj_cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social: string
          telefone?: string | null
          tipo?: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          cnpj_cpf?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social?: string
          telefone?: string | null
          tipo?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      insumos: {
        Row: {
          ativo: boolean
          categoria_id: string
          codigo: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          unidade_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_id: string
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          unidade_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_id?: string
          codigo?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_insumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamento_parcelas: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          conta_bancaria_id: string | null
          created_at: string
          created_by: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          id: string
          lancamento_id: string
          numero_parcela: number
          pago_em: string | null
          pago_por: string | null
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          id?: string
          lancamento_id: string
          numero_parcela?: number
          pago_em?: string | null
          pago_por?: string | null
          status?: string
          updated_at?: string
          valor: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          conta_bancaria_id?: string | null
          created_at?: string
          created_by?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          id?: string
          lancamento_id?: string
          numero_parcela?: number
          pago_em?: string | null
          pago_por?: string | null
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_parcelas_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_parcelas_conta_bancaria_id_fkey"
            columns: ["conta_bancaria_id"]
            isOneToOne: false
            referencedRelation: "contas_bancarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_parcelas_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_parcelas_pago_por_fkey"
            columns: ["pago_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamento_rateios: {
        Row: {
          centro_custo_id: string
          created_at: string
          created_by: string | null
          id: string
          lancamento_id: string
          valor: number
        }
        Insert: {
          centro_custo_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lancamento_id: string
          valor: number
        }
        Update: {
          centro_custo_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lancamento_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamento_rateios_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamento_rateios_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          categoria_id: string | null
          centro_custo_id: string | null
          competencia: string | null
          created_at: string
          created_by: string | null
          data_emissao: string
          data_vencimento: string | null
          descricao: string
          fornecedor_id: string | null
          id: string
          numero: string | null
          origem: string
          origem_id: string | null
          status: string
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          data_vencimento?: string | null
          descricao: string
          fornecedor_id?: string | null
          id?: string
          numero?: string | null
          origem: string
          origem_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          centro_custo_id?: string | null
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          data_vencimento?: string | null
          descricao?: string
          fornecedor_id?: string | null
          id?: string
          numero?: string | null
          origem?: string
          origem_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_financeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      leituras_equipamento: {
        Row: {
          created_at: string
          created_by: string | null
          data: string
          equipamento_id: string
          id: string
          origem: string
          origem_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string
          equipamento_id: string
          id?: string
          origem?: string
          origem_id?: string | null
          tipo: string
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string
          equipamento_id?: string
          id?: string
          origem?: string
          origem_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "leituras_equipamento_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      lixeira: {
        Row: {
          dados: Json
          excluido_em: string
          excluido_por: string
          id: string
          motivo: string
          registro_id: string
          restaurado_em: string | null
          restaurado_por: string | null
          tabela: string
        }
        Insert: {
          dados: Json
          excluido_em?: string
          excluido_por: string
          id?: string
          motivo: string
          registro_id: string
          restaurado_em?: string | null
          restaurado_por?: string | null
          tabela: string
        }
        Update: {
          dados?: Json
          excluido_em?: string
          excluido_por?: string
          id?: string
          motivo?: string
          registro_id?: string
          restaurado_em?: string | null
          restaurado_por?: string | null
          tabela?: string
        }
        Relationships: []
      }
      medicao_anexos: {
        Row: {
          caminho: string
          created_at: string
          created_by: string | null
          id: string
          medicao_id: string
          nome: string
        }
        Insert: {
          caminho: string
          created_at?: string
          created_by?: string | null
          id?: string
          medicao_id: string
          nome: string
        }
        Update: {
          caminho?: string
          created_at?: string
          created_by?: string | null
          id?: string
          medicao_id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicao_anexos_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      medicao_itens: {
        Row: {
          created_at: string
          id: string
          medicao_id: string
          memoria_calculo: string | null
          planilha_item_id: string
          quantidade: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          medicao_id: string
          memoria_calculo?: string | null
          planilha_item_id: string
          quantidade: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          medicao_id?: string
          memoria_calculo?: string | null
          planilha_item_id?: string
          quantidade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicao_itens_medicao_id_fkey"
            columns: ["medicao_id"]
            isOneToOne: false
            referencedRelation: "medicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicao_itens_planilha_item_id_fkey"
            columns: ["planilha_item_id"]
            isOneToOne: false
            referencedRelation: "planilha_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      medicoes: {
        Row: {
          competencia: string
          created_at: string
          created_by: string | null
          data_aprovacao: string | null
          descricao: string | null
          id: string
          motivo_cancelamento: string | null
          numero: string | null
          obra_id: string
          planilha_id: string
          reajuste_tipo: string
          reajuste_valor: number
          status: string
          updated_at: string
          valor_bruto: number
          valor_reajuste: number
          valor_total: number
        }
        Insert: {
          competencia: string
          created_at?: string
          created_by?: string | null
          data_aprovacao?: string | null
          descricao?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: string | null
          obra_id: string
          planilha_id: string
          reajuste_tipo?: string
          reajuste_valor?: number
          status?: string
          updated_at?: string
          valor_bruto?: number
          valor_reajuste?: number
          valor_total?: number
        }
        Update: {
          competencia?: string
          created_at?: string
          created_by?: string | null
          data_aprovacao?: string | null
          descricao?: string | null
          id?: string
          motivo_cancelamento?: string | null
          numero?: string | null
          obra_id?: string
          planilha_id?: string
          reajuste_tipo?: string
          reajuste_valor?: number
          status?: string
          updated_at?: string
          valor_bruto?: number
          valor_reajuste?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicoes_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicoes_planilha_id_fkey"
            columns: ["planilha_id"]
            isOneToOne: false
            referencedRelation: "planilhas_contratuais"
            referencedColumns: ["id"]
          },
        ]
      }
      obras: {
        Row: {
          ativo: boolean
          cliente_id: string | null
          created_at: string
          created_by: string | null
          data_fim_prevista: string | null
          data_inicio: string | null
          extensao_km: number | null
          id: string
          lote: string | null
          nome: string
          numero_contrato: string | null
          observacoes: string | null
          rodovia: string | null
          status: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          extensao_km?: number | null
          id?: string
          lote?: string | null
          nome: string
          numero_contrato?: string | null
          observacoes?: string | null
          rodovia?: string | null
          status?: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          data_fim_prevista?: string | null
          data_inicio?: string | null
          extensao_km?: number | null
          id?: string
          lote?: string | null
          nome?: string
          numero_contrato?: string | null
          observacoes?: string | null
          rodovia?: string | null
          status?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obras_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      oc_itens: {
        Row: {
          centro_custo_id: string
          created_at: string
          created_by: string | null
          deposito_id: string | null
          id: string
          insumo_id: string
          ordem_compra_id: string
          preco_unitario: number
          quantidade: number
        }
        Insert: {
          centro_custo_id: string
          created_at?: string
          created_by?: string | null
          deposito_id?: string | null
          id?: string
          insumo_id: string
          ordem_compra_id: string
          preco_unitario: number
          quantidade: number
        }
        Update: {
          centro_custo_id?: string
          created_at?: string
          created_by?: string | null
          deposito_id?: string | null
          id?: string
          insumo_id?: string
          ordem_compra_id?: string
          preco_unitario?: number
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "oc_itens_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_itens_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oc_itens_ordem_compra_id_fkey"
            columns: ["ordem_compra_id"]
            isOneToOne: false
            referencedRelation: "ordens_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamento_itens: {
        Row: {
          bdi: number | null
          codigo: string | null
          created_at: string
          custo_total: number | null
          custo_unitario: number | null
          descricao: string
          id: string
          indice: string | null
          orcamento_id: string
          ordem: number
          parent_id: string | null
          preco_total: number | null
          preco_unitario: number | null
          quantidade: number | null
          tipo: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          bdi?: number | null
          codigo?: string | null
          created_at?: string
          custo_total?: number | null
          custo_unitario?: number | null
          descricao: string
          id?: string
          indice?: string | null
          orcamento_id: string
          ordem?: number
          parent_id?: string | null
          preco_total?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          tipo: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          bdi?: number | null
          codigo?: string | null
          created_at?: string
          custo_total?: number | null
          custo_unitario?: number | null
          descricao?: string
          id?: string
          indice?: string | null
          orcamento_id?: string
          ordem?: number
          parent_id?: string | null
          preco_total?: number | null
          preco_unitario?: number | null
          quantidade?: number | null
          tipo?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_itens_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamento_itens_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          ativo: boolean
          bdi: number | null
          created_at: string
          created_by: string | null
          custo_total: number
          descricao: string | null
          id: string
          numero: string | null
          obra_id: string
          observacoes: string | null
          origem: string
          preco_total: number
          status: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bdi?: number | null
          created_at?: string
          created_by?: string | null
          custo_total?: number
          descricao?: string | null
          id?: string
          numero?: string | null
          obra_id: string
          observacoes?: string | null
          origem?: string
          preco_total?: number
          status?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bdi?: number | null
          created_at?: string
          created_by?: string | null
          custo_total?: number
          descricao?: string | null
          id?: string
          numero?: string | null
          obra_id?: string
          observacoes?: string | null
          origem?: string
          preco_total?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_compra: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          condicao_pagamento: string | null
          cotacao_id: string | null
          created_at: string
          created_by: string | null
          data_emissao: string
          fornecedor_id: string
          id: string
          motivo_rejeicao: string | null
          numero: string | null
          observacoes: string | null
          pedido_id: string | null
          status: string
          updated_at: string
          valor_total: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          condicao_pagamento?: string | null
          cotacao_id?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          fornecedor_id: string
          id?: string
          motivo_rejeicao?: string | null
          numero?: string | null
          observacoes?: string | null
          pedido_id?: string | null
          status?: string
          updated_at?: string
          valor_total?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          condicao_pagamento?: string | null
          cotacao_id?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          fornecedor_id?: string
          id?: string
          motivo_rejeicao?: string | null
          numero?: string | null
          observacoes?: string | null
          pedido_id?: string | null
          status?: string
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "ordens_compra_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_compra_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico: {
        Row: {
          centro_custo_id: string | null
          created_at: string
          created_by: string | null
          custo_mao_obra: number
          custo_pecas: number
          custo_terceiros: number
          custo_total: number
          data_abertura: string
          data_conclusao: string | null
          descricao: string
          equipamento_id: string
          horimetro_abertura: number | null
          horimetro_fechamento: number | null
          id: string
          km_abertura: number | null
          km_fechamento: number | null
          motivo_cancelamento: string | null
          numero: string | null
          observacao: string | null
          origem: string
          origem_id: string | null
          prioridade: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          centro_custo_id?: string | null
          created_at?: string
          created_by?: string | null
          custo_mao_obra?: number
          custo_pecas?: number
          custo_terceiros?: number
          custo_total?: number
          data_abertura?: string
          data_conclusao?: string | null
          descricao: string
          equipamento_id: string
          horimetro_abertura?: number | null
          horimetro_fechamento?: number | null
          id?: string
          km_abertura?: number | null
          km_fechamento?: number | null
          motivo_cancelamento?: string | null
          numero?: string | null
          observacao?: string | null
          origem?: string
          origem_id?: string | null
          prioridade?: string
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          centro_custo_id?: string | null
          created_at?: string
          created_by?: string | null
          custo_mao_obra?: number
          custo_pecas?: number
          custo_terceiros?: number
          custo_total?: number
          data_abertura?: string
          data_conclusao?: string | null
          descricao?: string
          equipamento_id?: string
          horimetro_abertura?: number | null
          horimetro_fechamento?: number | null
          id?: string
          km_abertura?: number | null
          km_fechamento?: number | null
          motivo_cancelamento?: string | null
          numero?: string | null
          observacao?: string | null
          origem?: string
          origem_id?: string | null
          prioridade?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_servico_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      os_mao_obra: {
        Row: {
          colaborador_id: string
          created_at: string
          created_by: string | null
          custo_total: number | null
          horas: number
          id: string
          ordem_servico_id: string
          valor_hora: number
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          created_by?: string | null
          custo_total?: number | null
          horas: number
          id?: string
          ordem_servico_id: string
          valor_hora?: number
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          created_by?: string | null
          custo_total?: number | null
          horas?: number
          id?: string
          ordem_servico_id?: string
          valor_hora?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_mao_obra_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_mao_obra_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      os_pecas: {
        Row: {
          created_at: string
          created_by: string | null
          custo_total: number
          custo_unitario: number
          deposito_id: string
          id: string
          insumo_id: string
          movimento_id: string | null
          ordem_servico_id: string
          quantidade: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custo_total?: number
          custo_unitario?: number
          deposito_id: string
          id?: string
          insumo_id: string
          movimento_id?: string | null
          ordem_servico_id: string
          quantidade: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custo_total?: number
          custo_unitario?: number
          deposito_id?: string
          id?: string
          insumo_id?: string
          movimento_id?: string | null
          ordem_servico_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_pecas_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pecas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pecas_movimento_id_fkey"
            columns: ["movimento_id"]
            isOneToOne: false
            referencedRelation: "estoque_movimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_pecas_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      os_terceiros: {
        Row: {
          created_at: string
          created_by: string | null
          data_vencimento: string | null
          descricao: string
          fornecedor_id: string | null
          id: string
          lancamento_id: string | null
          ordem_servico_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_vencimento?: string | null
          descricao: string
          fornecedor_id?: string | null
          id?: string
          lancamento_id?: string | null
          ordem_servico_id: string
          valor: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_vencimento?: string | null
          descricao?: string
          fornecedor_id?: string | null
          id?: string
          lancamento_id?: string | null
          ordem_servico_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "os_terceiros_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_terceiros_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_terceiros_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      os_transicoes: {
        Row: {
          criado_em: string
          de_status: string | null
          id: string
          motivo: string | null
          ordem_servico_id: string
          para_status: string
          usuario_id: string | null
        }
        Insert: {
          criado_em?: string
          de_status?: string | null
          id?: string
          motivo?: string | null
          ordem_servico_id: string
          para_status: string
          usuario_id?: string | null
        }
        Update: {
          criado_em?: string
          de_status?: string | null
          id?: string
          motivo?: string | null
          ordem_servico_id?: string
          para_status?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "os_transicoes_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          centro_custo_id: string
          created_at: string
          created_by: string | null
          deposito_id: string | null
          id: string
          insumo_id: string
          observacao: string | null
          pedido_id: string
          quantidade: number
        }
        Insert: {
          centro_custo_id: string
          created_at?: string
          created_by?: string | null
          deposito_id?: string | null
          id?: string
          insumo_id: string
          observacao?: string | null
          pedido_id: string
          quantidade: number
        }
        Update: {
          centro_custo_id?: string
          created_at?: string
          created_by?: string | null
          deposito_id?: string | null
          id?: string
          insumo_id?: string
          observacao?: string | null
          pedido_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_deposito_id_fkey"
            columns: ["deposito_id"]
            isOneToOne: false
            referencedRelation: "depositos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string
          created_by: string | null
          id: string
          justificativa: string | null
          motivo_rejeicao: string | null
          numero: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          justificativa?: string | null
          motivo_rejeicao?: string | null
          numero?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          justificativa?: string | null
          motivo_rejeicao?: string | null
          numero?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_permissoes: {
        Row: {
          acao: string
          created_at: string
          created_by: string | null
          id: string
          perfil_id: string
          recurso: string
        }
        Insert: {
          acao: string
          created_at?: string
          created_by?: string | null
          id?: string
          perfil_id: string
          recurso: string
        }
        Update: {
          acao?: string
          created_at?: string
          created_by?: string | null
          id?: string
          perfil_id?: string
          recurso?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_permissoes_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      planilha_itens: {
        Row: {
          codigo: string | null
          created_at: string
          descricao: string
          id: string
          ordem: number
          planilha_id: string
          preco_unitario: number
          quantidade_contratada: number
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          codigo?: string | null
          created_at?: string
          descricao: string
          id?: string
          ordem?: number
          planilha_id: string
          preco_unitario: number
          quantidade_contratada: number
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          codigo?: string | null
          created_at?: string
          descricao?: string
          id?: string
          ordem?: number
          planilha_id?: string
          preco_unitario?: number
          quantidade_contratada?: number
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planilha_itens_planilha_id_fkey"
            columns: ["planilha_id"]
            isOneToOne: false
            referencedRelation: "planilhas_contratuais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planilha_itens_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades_medida"
            referencedColumns: ["id"]
          },
        ]
      }
      planilhas_contratuais: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          nome: string
          obra_id: string
          observacao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          obra_id: string
          observacao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          obra_id?: string
          observacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planilhas_contratuais_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: true
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_atividades: {
        Row: {
          created_at: string
          descricao: string
          id: string
          intervalo_tipo: string
          intervalo_valor: number
          ordem: number
          plano_id: string
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          intervalo_tipo: string
          intervalo_valor: number
          ordem?: number
          plano_id: string
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          intervalo_tipo?: string
          intervalo_valor?: number
          ordem?: number
          plano_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_atividades_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_preventivos"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_preventivos: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      recebimento_itens: {
        Row: {
          created_at: string
          id: string
          oc_item_id: string
          quantidade_recebida: number
          recebimento_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          oc_item_id: string
          quantidade_recebida: number
          recebimento_id: string
        }
        Update: {
          created_at?: string
          id?: string
          oc_item_id?: string
          quantidade_recebida?: number
          recebimento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recebimento_itens_oc_item_id_fkey"
            columns: ["oc_item_id"]
            isOneToOne: false
            referencedRelation: "oc_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recebimento_itens_recebimento_id_fkey"
            columns: ["recebimento_id"]
            isOneToOne: false
            referencedRelation: "recebimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimentos: {
        Row: {
          created_at: string
          created_by: string | null
          data_recebimento: string
          data_vencimento: string | null
          id: string
          numero: string | null
          numero_nf: string | null
          observacoes: string | null
          ordem_compra_id: string
          status: string
          updated_at: string
          valor_nf: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_recebimento?: string
          data_vencimento?: string | null
          id?: string
          numero?: string | null
          numero_nf?: string | null
          observacoes?: string | null
          ordem_compra_id: string
          status?: string
          updated_at?: string
          valor_nf?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_recebimento?: string
          data_vencimento?: string | null
          id?: string
          numero?: string | null
          numero_nf?: string | null
          observacoes?: string | null
          ordem_compra_id?: string
          status?: string
          updated_at?: string
          valor_nf?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recebimentos_ordem_compra_id_fkey"
            columns: ["ordem_compra_id"]
            isOneToOne: false
            referencedRelation: "ordens_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_adiantamentos: {
        Row: {
          colaborador_id: string
          competencia: string
          created_at: string
          created_by: string | null
          data: string
          descricao: string | null
          folha_id: string | null
          id: string
          updated_at: string
          valor: number
        }
        Insert: {
          colaborador_id: string
          competencia: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          folha_id?: string | null
          id?: string
          updated_at?: string
          valor: number
        }
        Update: {
          colaborador_id?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string | null
          folha_id?: string | null
          id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_adiantamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_adiantamentos_folha_id_fkey"
            columns: ["folha_id"]
            isOneToOne: false
            referencedRelation: "folhas"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_apontamentos: {
        Row: {
          colaborador_id: string
          created_at: string
          horas_extras: number
          horas_normais: number
          id: string
          observacao: string | null
          ponto_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          horas_extras?: number
          horas_normais?: number
          id?: string
          observacao?: string | null
          ponto_id: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          horas_extras?: number
          horas_normais?: number
          id?: string
          observacao?: string | null
          ponto_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_apontamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_apontamentos_ponto_id_fkey"
            columns: ["ponto_id"]
            isOneToOne: false
            referencedRelation: "rh_pontos"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_diarias: {
        Row: {
          colaborador_id: string
          competencia: string
          created_at: string
          created_by: string | null
          data: string
          id: string
          lancamento_id: string | null
          obra_id: string | null
          observacao: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          colaborador_id: string
          competencia: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          lancamento_id?: string | null
          obra_id?: string | null
          observacao?: string | null
          updated_at?: string
          valor: number
        }
        Update: {
          colaborador_id?: string
          competencia?: string
          created_at?: string
          created_by?: string | null
          data?: string
          id?: string
          lancamento_id?: string | null
          obra_id?: string | null
          observacao?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_diarias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_diarias_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_diarias_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_documentos: {
        Row: {
          colaborador_id: string
          created_at: string
          created_by: string | null
          data_emissao: string | null
          data_vencimento: string | null
          descricao: string
          id: string
          observacao: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          data_vencimento?: string | null
          descricao: string
          id?: string
          observacao?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          data_vencimento?: string | null
          descricao?: string
          id?: string
          observacao?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_documentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_epis: {
        Row: {
          assinado: boolean
          ca: string | null
          colaborador_id: string
          created_at: string
          created_by: string | null
          data_devolucao: string | null
          data_entrega: string
          descricao: string
          id: string
          observacao: string | null
          quantidade: number
          updated_at: string
        }
        Insert: {
          assinado?: boolean
          ca?: string | null
          colaborador_id: string
          created_at?: string
          created_by?: string | null
          data_devolucao?: string | null
          data_entrega?: string
          descricao: string
          id?: string
          observacao?: string | null
          quantidade?: number
          updated_at?: string
        }
        Update: {
          assinado?: boolean
          ca?: string | null
          colaborador_id?: string
          created_at?: string
          created_by?: string | null
          data_devolucao?: string | null
          data_entrega?: string
          descricao?: string
          id?: string
          observacao?: string | null
          quantidade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_epis_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ferias: {
        Row: {
          colaborador_id: string
          created_at: string
          created_by: string | null
          data_fim: string | null
          data_inicio: string | null
          dias: number
          id: string
          observacao: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          status: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dias?: number
          id?: string
          observacao?: string | null
          periodo_aquisitivo_fim: string
          periodo_aquisitivo_inicio: string
          status?: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          created_by?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          dias?: number
          id?: string
          observacao?: string | null
          periodo_aquisitivo_fim?: string
          periodo_aquisitivo_inicio?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ferias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ocorrencias: {
        Row: {
          colaborador_id: string
          created_at: string
          created_by: string | null
          data: string
          descricao: string
          id: string
          observacao: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao: string
          id?: string
          observacao?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          created_by?: string | null
          data?: string
          descricao?: string
          id?: string
          observacao?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ocorrencias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_pontos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string
          created_by: string | null
          data: string
          encarregado_id: string | null
          id: string
          obra_id: string
          observacao: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          created_by?: string | null
          data: string
          encarregado_id?: string | null
          id?: string
          obra_id: string
          observacao?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          created_by?: string | null
          data?: string
          encarregado_id?: string | null
          id?: string
          obra_id?: string
          observacao?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_pontos_encarregado_id_fkey"
            columns: ["encarregado_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_pontos_obra_id_fkey"
            columns: ["obra_id"]
            isOneToOne: false
            referencedRelation: "obras"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades_medida: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          nome: string
          sigla: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
          sigla: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
          sigla?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      usuario_permissoes: {
        Row: {
          acao: string
          created_at: string
          created_by: string | null
          id: string
          recurso: string
          usuario_id: string
        }
        Insert: {
          acao: string
          created_at?: string
          created_by?: string | null
          id?: string
          recurso: string
          usuario_id: string
        }
        Update: {
          acao?: string
          created_at?: string
          created_by?: string | null
          id?: string
          recurso?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_permissoes_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          email: string
          id: string
          nome: string
          perfil_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          email: string
          id: string
          nome: string
          perfil_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          nome?: string
          perfil_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aplicar_perfil: {
        Args: { p_perfil_id: string; p_usuario_id: string }
        Returns: undefined
      }
      fn_abastecer: {
        Args: {
          p_data?: string
          p_equipamento: string
          p_horimetro?: number
          p_km?: number
          p_obs?: string
          p_operador?: string
          p_quantidade: number
          p_tanque: string
        }
        Returns: string
      }
      fn_abrir_os: {
        Args: {
          p_descricao: string
          p_equipamento: string
          p_horimetro?: number
          p_km?: number
          p_origem?: string
          p_origem_id?: string
          p_prioridade?: string
          p_tipo: string
        }
        Returns: string
      }
      fn_aprovar_medicao: {
        Args: { p_data_vencimento?: string; p_medicao: string }
        Returns: string
      }
      fn_aprovar_ordem_compra: { Args: { p_oc_id: string }; Returns: undefined }
      fn_aprovar_parcela: { Args: { p_parcela_id: string }; Returns: undefined }
      fn_aprovar_ponto: { Args: { p_ponto: string }; Returns: undefined }
      fn_cancelar_medicao: {
        Args: { p_medicao: string; p_motivo: string }
        Returns: undefined
      }
      fn_cancelar_os: {
        Args: { p_motivo: string; p_os: string }
        Returns: undefined
      }
      fn_conciliar_transacao: {
        Args: { p_parcela_id: string; p_transacao_id: string }
        Returns: undefined
      }
      fn_concluir_os: {
        Args: { p_horimetro_fech?: number; p_km_fech?: number; p_os: string }
        Returns: undefined
      }
      fn_desaprovar_medicao: {
        Args: { p_medicao: string; p_motivo: string }
        Returns: undefined
      }
      fn_desaprovar_ordem_compra: {
        Args: { p_motivo: string; p_oc_id: string }
        Returns: undefined
      }
      fn_desaprovar_parcela: {
        Args: { p_motivo: string; p_parcela_id: string }
        Returns: undefined
      }
      fn_desconciliar_transacao: {
        Args: { p_transacao_id: string }
        Returns: undefined
      }
      fn_estoque_ajuste: {
        Args: {
          p_deposito: string
          p_insumo: string
          p_motivo: string
          p_quantidade_nova: number
        }
        Returns: string
      }
      fn_estoque_entrada: {
        Args: {
          p_custo_unitario: number
          p_data: string
          p_deposito: string
          p_insumo: string
          p_obs: string
          p_quantidade: number
        }
        Returns: string
      }
      fn_estoque_entrada_interna: {
        Args: {
          p_custo_unitario: number
          p_data: string
          p_deposito: string
          p_insumo: string
          p_obs: string
          p_origem: string
          p_origem_id: string
          p_quantidade: number
        }
        Returns: string
      }
      fn_estoque_saida: {
        Args: {
          p_centro_custo: string
          p_data: string
          p_deposito: string
          p_insumo: string
          p_obs: string
          p_quantidade: number
        }
        Returns: string
      }
      fn_estoque_saida_interna: {
        Args: {
          p_centro_custo: string
          p_data: string
          p_deposito: string
          p_equipamento: string
          p_insumo: string
          p_obs: string
          p_origem: string
          p_origem_id: string
          p_quantidade: number
          p_tipo: string
        }
        Returns: string
      }
      fn_estoque_transferencia: {
        Args: {
          p_data: string
          p_destino: string
          p_insumo: string
          p_obs: string
          p_origem: string
          p_quantidade: number
        }
        Returns: string
      }
      fn_excluir_cadastro: {
        Args: { p_id: string; p_motivo: string; p_tabela: string }
        Returns: undefined
      }
      fn_executar_checklist: {
        Args: {
          p_abrir_os?: boolean
          p_checklist: string
          p_equipamento: string
          p_horimetro?: number
          p_km?: number
          p_obs?: string
          p_operador?: string
          p_respostas: Json
        }
        Returns: string
      }
      fn_fechar_diarias: {
        Args: {
          p_colaborador: string
          p_competencia: string
          p_data_vencimento?: string
        }
        Returns: string
      }
      fn_fechar_folha: { Args: { p_folha: string }; Returns: undefined }
      fn_gerar_folha: {
        Args: { p_competencia: string; p_encargos_pct?: number }
        Returns: string
      }
      fn_gerar_os_preventiva: {
        Args: { p_equip_plano: string }
        Returns: string
      }
      fn_importar_extrato: {
        Args: {
          p_conta_id: string
          p_nome: string
          p_periodo_fim: string
          p_periodo_inicio: string
          p_transacoes: Json
        }
        Returns: Json
      }
      fn_iniciar_os: { Args: { p_os: string }; Returns: undefined }
      fn_os_adicionar_peca: {
        Args: {
          p_deposito: string
          p_insumo: string
          p_os: string
          p_quantidade: number
        }
        Returns: string
      }
      fn_pagar_parcela: {
        Args: {
          p_conta_id: string
          p_data_pagamento: string
          p_parcela_id: string
        }
        Returns: undefined
      }
      fn_reabrir_folha: { Args: { p_folha: string }; Returns: undefined }
      fn_reabrir_ponto: { Args: { p_ponto: string }; Returns: undefined }
      fn_recalcular_saldo_estoque: {
        Args: { p_deposito: string; p_insumo: string }
        Returns: undefined
      }
      fn_recalcular_status_lancamento: {
        Args: { p_lanc_id: string }
        Returns: undefined
      }
      fn_recurso_do_anexo: { Args: { p_tabela: string }; Returns: string }
      fn_recurso_do_cadastro: { Args: { p_tabela: string }; Returns: string }
      fn_recurso_do_path_anexo: { Args: { p_path: string }; Returns: string }
      fn_registrar_recebimento: {
        Args: {
          p_data_recebimento: string
          p_data_vencimento: string
          p_itens: Json
          p_numero_nf: string
          p_observacoes?: string
          p_oc_id: string
          p_valor_nf: number
        }
        Returns: string
      }
      fn_rel_aging: {
        Args: never
        Returns: {
          data_vencimento: string
          tipo: string
          total: number
        }[]
      }
      fn_rel_custo_centro_custo: {
        Args: never
        Returns: {
          centro_custo_id: string
          codigo: string
          nome: string
          total: number
        }[]
      }
      fn_rel_dre: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          categoria: string
          categoria_id: string
          tipo: string
          total: number
        }[]
      }
      fn_rel_fluxo_caixa: {
        Args: never
        Returns: {
          mes: string
          realizado: boolean
          tipo: string
          total: number
        }[]
      }
      fn_rel_fornecedores_com_lancamentos: {
        Args: never
        Returns: {
          id: string
          nome: string
        }[]
      }
      fn_rel_posicao_bancaria: {
        Args: never
        Returns: {
          conta_bancaria_id: string
          tipo: string
          total: number
        }[]
      }
      fn_restaurar_cadastro: {
        Args: { p_lixeira_id: string }
        Returns: undefined
      }
      fn_salvar_lancamento: {
        Args: { p_dados: Json; p_id: string; p_parcelas: Json; p_rateios: Json }
        Returns: string
      }
      nomes_usuarios_auditoria: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          nome: string
        }[]
      }
      nomes_usuarios_compras: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          nome: string
        }[]
      }
      proximo_numero_documento: { Args: { p_tipo: string }; Returns: string }
      recalcular_orcamento: { Args: { p_orc: string }; Returns: undefined }
      salvar_matriz_usuario: {
        Args: { p_permissoes: Json; p_usuario_id: string }
        Returns: undefined
      }
      salvar_permissoes_perfil: {
        Args: { p_perfil_id: string; p_permissoes: Json }
        Returns: undefined
      }
      tabelas_auditadas: { Args: never; Returns: string[] }
      tem_permissao: {
        Args: { p_acao: string; p_recurso: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
