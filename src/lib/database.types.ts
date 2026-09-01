export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      anexo_vinculos: {
        Row: {
          arquivo_id: string;
          created_at: string;
          created_by: string | null;
          entidade_id: string;
          entidade_tipo: string;
          id: string;
          nome_exibicao: string | null;
          origem: string;
          vinculo_origem_id: string | null;
        };
        Insert: {
          arquivo_id: string;
          created_at?: string;
          created_by?: string | null;
          entidade_id: string;
          entidade_tipo: string;
          id?: string;
          nome_exibicao?: string | null;
          origem?: string;
          vinculo_origem_id?: string | null;
        };
        Update: {
          arquivo_id?: string;
          created_at?: string;
          created_by?: string | null;
          entidade_id?: string;
          entidade_tipo?: string;
          id?: string;
          nome_exibicao?: string | null;
          origem?: string;
          vinculo_origem_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "anexo_vinculos_arquivo_id_fkey";
            columns: ["arquivo_id"];
            isOneToOne: false;
            referencedRelation: "arquivos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "anexo_vinculos_vinculo_origem_id_fkey";
            columns: ["vinculo_origem_id"];
            isOneToOne: false;
            referencedRelation: "anexo_vinculos";
            referencedColumns: ["id"];
          },
        ];
      };
      arquivos: {
        Row: {
          created_at: string;
          created_by: string | null;
          hash_sha256: string | null;
          id: string;
          nome_original: string;
          orfao_em: string | null;
          path_storage: string;
          tamanho_bytes: number;
          tipo_mime: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          hash_sha256?: string | null;
          id?: string;
          nome_original: string;
          orfao_em?: string | null;
          path_storage: string;
          tamanho_bytes: number;
          tipo_mime?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          hash_sha256?: string | null;
          id?: string;
          nome_original?: string;
          orfao_em?: string | null;
          path_storage?: string;
          tamanho_bytes?: number;
          tipo_mime?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          acao: string;
          criado_em: string;
          dados_antes: Json | null;
          dados_depois: Json | null;
          id: number;
          registro_id: string | null;
          tabela: string;
          usuario_id: string | null;
        };
        Insert: {
          acao: string;
          criado_em?: string;
          dados_antes?: Json | null;
          dados_depois?: Json | null;
          id?: never;
          registro_id?: string | null;
          tabela: string;
          usuario_id?: string | null;
        };
        Update: {
          acao?: string;
          criado_em?: string;
          dados_antes?: Json | null;
          dados_depois?: Json | null;
          id?: never;
          registro_id?: string | null;
          tabela?: string;
          usuario_id?: string | null;
        };
        Relationships: [];
      };
      banco_horas_movimentos: {
        Row: {
          colaborador_id: string;
          created_at: string;
          created_by: string | null;
          data: string;
          horas: number;
          id: string;
          motivo: string | null;
          observacao: string | null;
          tipo: string;
          updated_at: string;
        };
        Insert: {
          colaborador_id: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          horas: number;
          id?: string;
          motivo?: string | null;
          observacao?: string | null;
          tipo: string;
          updated_at?: string;
        };
        Update: {
          colaborador_id?: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          horas?: number;
          id?: string;
          motivo?: string | null;
          observacao?: string | null;
          tipo?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "banco_horas_movimentos_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
        ];
      };
      cartoes_credito: {
        Row: {
          ativo: boolean;
          banco: string | null;
          bandeira: string | null;
          created_at: string;
          created_by: string | null;
          dia_fechamento: number | null;
          dia_vencimento: number | null;
          id: string;
          nome: string;
          ultimos_digitos: string;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          banco?: string | null;
          bandeira?: string | null;
          created_at?: string;
          created_by?: string | null;
          dia_fechamento?: number | null;
          dia_vencimento?: number | null;
          id?: string;
          nome: string;
          ultimos_digitos: string;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          banco?: string | null;
          bandeira?: string | null;
          created_at?: string;
          created_by?: string | null;
          dia_fechamento?: number | null;
          dia_vencimento?: number | null;
          id?: string;
          nome?: string;
          ultimos_digitos?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cartoes_credito_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      categorias_financeiras: {
        Row: {
          ativo: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          natureza: string;
          nome: string;
          pai_id: string | null;
          tipo: string;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          natureza?: string;
          nome: string;
          pai_id?: string | null;
          tipo: string;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          natureza?: string;
          nome?: string;
          pai_id?: string | null;
          tipo?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categorias_financeiras_pai_id_fkey";
            columns: ["pai_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
        ];
      };
      categorias_insumo: {
        Row: {
          ativo: boolean;
          categoria_financeira_id: string | null;
          created_at: string;
          created_by: string | null;
          grupo_id: string;
          id: string;
          nome: string;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          categoria_financeira_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          grupo_id: string;
          id?: string;
          nome: string;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          categoria_financeira_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          grupo_id?: string;
          id?: string;
          nome?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categorias_insumo_categoria_financeira_id_fkey";
            columns: ["categoria_financeira_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categorias_insumo_grupo_id_fkey";
            columns: ["grupo_id"];
            isOneToOne: false;
            referencedRelation: "insumo_grupos";
            referencedColumns: ["id"];
          },
        ];
      };
      centros_custo: {
        Row: {
          ativo: boolean;
          codigo: string | null;
          created_at: string;
          created_by: string | null;
          equipamento_id: string | null;
          id: string;
          nivel: number;
          nome: string;
          obra_id: string | null;
          orcamento: number | null;
          pai_id: string | null;
          sistema: boolean;
          tipo: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          codigo?: string | null;
          created_at?: string;
          created_by?: string | null;
          equipamento_id?: string | null;
          id?: string;
          nivel: number;
          nome: string;
          obra_id?: string | null;
          orcamento?: number | null;
          pai_id?: string | null;
          sistema?: boolean;
          tipo?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          codigo?: string | null;
          created_at?: string;
          created_by?: string | null;
          equipamento_id?: string | null;
          id?: string;
          nivel?: number;
          nome?: string;
          obra_id?: string | null;
          orcamento?: number | null;
          pai_id?: string | null;
          sistema?: boolean;
          tipo?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "centros_custo_equipamento_fk";
            columns: ["equipamento_id"];
            isOneToOne: false;
            referencedRelation: "equipamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "centros_custo_obra_fk";
            columns: ["obra_id"];
            isOneToOne: false;
            referencedRelation: "obras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "centros_custo_pai_id_fkey";
            columns: ["pai_id"];
            isOneToOne: false;
            referencedRelation: "centros_custo";
            referencedColumns: ["id"];
          },
        ];
      };
      clientes: {
        Row: {
          ativo: boolean;
          cidade: string | null;
          cpf_cnpj: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          endereco: string | null;
          id: string;
          inscricao_estadual: string | null;
          nome: string;
          nome_fantasia: string | null;
          observacoes: string | null;
          telefone: string | null;
          tipo: string;
          uf: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          cidade?: string | null;
          cpf_cnpj?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          endereco?: string | null;
          id?: string;
          inscricao_estadual?: string | null;
          nome: string;
          nome_fantasia?: string | null;
          observacoes?: string | null;
          telefone?: string | null;
          tipo?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          cidade?: string | null;
          cpf_cnpj?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          endereco?: string | null;
          id?: string;
          inscricao_estadual?: string | null;
          nome?: string;
          nome_fantasia?: string | null;
          observacoes?: string | null;
          telefone?: string | null;
          tipo?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      colaboradores: {
        Row: {
          agencia: string | null;
          ativo: boolean;
          banco: string | null;
          centro_custo_id: string | null;
          chave_pix: string | null;
          cnh_categoria: string | null;
          cnh_numero: string | null;
          cnh_validade: string | null;
          conta: string | null;
          cpf: string | null;
          created_at: string;
          created_by: string | null;
          ctps_numero: string | null;
          ctps_serie: string | null;
          ctps_uf: string | null;
          data_admissao: string | null;
          data_demissao: string | null;
          data_nascimento: string | null;
          desconto_valor: number | null;
          encargos_percentual: number | null;
          escolaridade: string | null;
          estado_civil: string | null;
          funcao_id: string | null;
          gratificacao: number;
          id: string;
          jornada_id: string | null;
          motivo_desligamento: string | null;
          nacionalidade: string | null;
          nome: string;
          nome_mae: string | null;
          obra_id: string | null;
          pis: string | null;
          raca_cor: string | null;
          reservista: string | null;
          rg: string | null;
          rg_orgao: string | null;
          rg_uf: string | null;
          salario: number | null;
          telefone: string | null;
          tipo_conta: string | null;
          tipo_rescisao: string | null;
          titulo_eleitor: string | null;
          updated_at: string;
          valor_diaria: number | null;
          vinculo: string;
        };
        Insert: {
          agencia?: string | null;
          ativo?: boolean;
          banco?: string | null;
          centro_custo_id?: string | null;
          chave_pix?: string | null;
          cnh_categoria?: string | null;
          cnh_numero?: string | null;
          cnh_validade?: string | null;
          conta?: string | null;
          cpf?: string | null;
          created_at?: string;
          created_by?: string | null;
          ctps_numero?: string | null;
          ctps_serie?: string | null;
          ctps_uf?: string | null;
          data_admissao?: string | null;
          data_demissao?: string | null;
          data_nascimento?: string | null;
          desconto_valor?: number | null;
          encargos_percentual?: number | null;
          escolaridade?: string | null;
          estado_civil?: string | null;
          funcao_id?: string | null;
          gratificacao?: number;
          id?: string;
          jornada_id?: string | null;
          motivo_desligamento?: string | null;
          nacionalidade?: string | null;
          nome: string;
          nome_mae?: string | null;
          obra_id?: string | null;
          pis?: string | null;
          raca_cor?: string | null;
          reservista?: string | null;
          rg?: string | null;
          rg_orgao?: string | null;
          rg_uf?: string | null;
          salario?: number | null;
          telefone?: string | null;
          tipo_conta?: string | null;
          tipo_rescisao?: string | null;
          titulo_eleitor?: string | null;
          updated_at?: string;
          valor_diaria?: number | null;
          vinculo?: string;
        };
        Update: {
          agencia?: string | null;
          ativo?: boolean;
          banco?: string | null;
          centro_custo_id?: string | null;
          chave_pix?: string | null;
          cnh_categoria?: string | null;
          cnh_numero?: string | null;
          cnh_validade?: string | null;
          conta?: string | null;
          cpf?: string | null;
          created_at?: string;
          created_by?: string | null;
          ctps_numero?: string | null;
          ctps_serie?: string | null;
          ctps_uf?: string | null;
          data_admissao?: string | null;
          data_demissao?: string | null;
          data_nascimento?: string | null;
          desconto_valor?: number | null;
          encargos_percentual?: number | null;
          escolaridade?: string | null;
          estado_civil?: string | null;
          funcao_id?: string | null;
          gratificacao?: number;
          id?: string;
          jornada_id?: string | null;
          motivo_desligamento?: string | null;
          nacionalidade?: string | null;
          nome?: string;
          nome_mae?: string | null;
          obra_id?: string | null;
          pis?: string | null;
          raca_cor?: string | null;
          reservista?: string | null;
          rg?: string | null;
          rg_orgao?: string | null;
          rg_uf?: string | null;
          salario?: number | null;
          telefone?: string | null;
          tipo_conta?: string | null;
          tipo_rescisao?: string | null;
          titulo_eleitor?: string | null;
          updated_at?: string;
          valor_diaria?: number | null;
          vinculo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "colaboradores_centro_custo_id_fkey";
            columns: ["centro_custo_id"];
            isOneToOne: false;
            referencedRelation: "centros_custo";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "colaboradores_funcao_id_fkey";
            columns: ["funcao_id"];
            isOneToOne: false;
            referencedRelation: "funcoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "colaboradores_jornada_id_fkey";
            columns: ["jornada_id"];
            isOneToOne: false;
            referencedRelation: "jornadas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "colaboradores_obra_id_fkey";
            columns: ["obra_id"];
            isOneToOne: false;
            referencedRelation: "obras";
            referencedColumns: ["id"];
          },
        ];
      };
      competencia_eventos: {
        Row: {
          created_at: string;
          created_by: string | null;
          entidade_id: string | null;
          entidade_tipo: string | null;
          id: string;
          mes: string;
          motivo: string | null;
          tipo: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          entidade_id?: string | null;
          entidade_tipo?: string | null;
          id?: string;
          mes: string;
          motivo?: string | null;
          tipo: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          entidade_id?: string | null;
          entidade_tipo?: string | null;
          id?: string;
          mes?: string;
          motivo?: string | null;
          tipo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "competencia_eventos_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      competencias_fechadas: {
        Row: {
          created_at: string;
          created_by: string | null;
          fechado_em: string;
          fechado_por: string | null;
          id: string;
          mes: string;
          observacao: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          fechado_em?: string;
          fechado_por?: string | null;
          id?: string;
          mes: string;
          observacao?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          fechado_em?: string;
          fechado_por?: string | null;
          id?: string;
          mes?: string;
          observacao?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competencias_fechadas_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competencias_fechadas_fechado_por_fkey";
            columns: ["fechado_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      condicao_parcelas: {
        Row: {
          condicao_id: string;
          created_at: string;
          dias_offset: number;
          id: string;
          numero: number;
          percentual: number;
        };
        Insert: {
          condicao_id: string;
          created_at?: string;
          dias_offset: number;
          id?: string;
          numero: number;
          percentual: number;
        };
        Update: {
          condicao_id?: string;
          created_at?: string;
          dias_offset?: number;
          id?: string;
          numero?: number;
          percentual?: number;
        };
        Relationships: [
          {
            foreignKeyName: "condicao_parcelas_condicao_id_fkey";
            columns: ["condicao_id"];
            isOneToOne: false;
            referencedRelation: "condicoes_pagamento";
            referencedColumns: ["id"];
          },
        ];
      };
      condicoes_pagamento: {
        Row: {
          ativo: boolean;
          created_at: string;
          created_by: string | null;
          descricao: string;
          id: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          descricao: string;
          id?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          descricao?: string;
          id?: string;
        };
        Relationships: [];
      };
      configuracoes: {
        Row: {
          chave: string;
          descricao: string | null;
          updated_at: string;
          updated_by: string | null;
          valor: Json;
        };
        Insert: {
          chave: string;
          descricao?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          valor: Json;
        };
        Update: {
          chave?: string;
          descricao?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          valor?: Json;
        };
        Relationships: [];
      };
      contas_bancarias: {
        Row: {
          agencia: string | null;
          ativo: boolean;
          banco: string;
          conta: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          nome: string;
          saldo_inicial: number;
          saldo_inicial_data: string | null;
          tipo: string;
          updated_at: string;
        };
        Insert: {
          agencia?: string | null;
          ativo?: boolean;
          banco?: string;
          conta?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome: string;
          saldo_inicial?: number;
          saldo_inicial_data?: string | null;
          tipo?: string;
          updated_at?: string;
        };
        Update: {
          agencia?: string | null;
          ativo?: boolean;
          banco?: string;
          conta?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome?: string;
          saldo_inicial?: number;
          saldo_inicial_data?: string | null;
          tipo?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cotacao_fornecedores: {
        Row: {
          condicao_pagamento_id: string | null;
          cotacao_id: string;
          created_at: string;
          created_by: string | null;
          forma_pagamento_id: string | null;
          fornecedor_id: string;
          id: string;
          observacao: string | null;
          prazo_entrega_dias: number | null;
        };
        Insert: {
          condicao_pagamento_id?: string | null;
          cotacao_id: string;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento_id?: string | null;
          fornecedor_id: string;
          id?: string;
          observacao?: string | null;
          prazo_entrega_dias?: number | null;
        };
        Update: {
          condicao_pagamento_id?: string | null;
          cotacao_id?: string;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento_id?: string | null;
          fornecedor_id?: string;
          id?: string;
          observacao?: string | null;
          prazo_entrega_dias?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "cotacao_fornecedores_condicao_pagamento_id_fkey";
            columns: ["condicao_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "condicoes_pagamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotacao_fornecedores_cotacao_id_fkey";
            columns: ["cotacao_id"];
            isOneToOne: false;
            referencedRelation: "cotacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotacao_fornecedores_forma_pagamento_id_fkey";
            columns: ["forma_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "formas_pagamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotacao_fornecedores_fornecedor_id_fkey";
            columns: ["fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["id"];
          },
        ];
      };
      cotacao_itens: {
        Row: {
          cotacao_fornecedor_id: string;
          cotacao_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          insumo_id: string;
          preco_unitario: number;
          quantidade: number;
        };
        Insert: {
          cotacao_fornecedor_id: string;
          cotacao_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          insumo_id: string;
          preco_unitario: number;
          quantidade: number;
        };
        Update: {
          cotacao_fornecedor_id?: string;
          cotacao_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          insumo_id?: string;
          preco_unitario?: number;
          quantidade?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cotacao_itens_cotacao_fornecedor_id_fkey";
            columns: ["cotacao_fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "cotacao_fornecedores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotacao_itens_cotacao_id_fkey";
            columns: ["cotacao_id"];
            isOneToOne: false;
            referencedRelation: "cotacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotacao_itens_insumo_id_fkey";
            columns: ["insumo_id"];
            isOneToOne: false;
            referencedRelation: "insumos";
            referencedColumns: ["id"];
          },
        ];
      };
      cotacoes: {
        Row: {
          categoria_id: string | null;
          created_at: string;
          created_by: string | null;
          descricao: string | null;
          id: string;
          motivo_selecao: string | null;
          numero: string | null;
          observacoes: string | null;
          status: string;
          updated_at: string;
          vencedor_fornecedor_id: string | null;
        };
        Insert: {
          categoria_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          motivo_selecao?: string | null;
          numero?: string | null;
          observacoes?: string | null;
          status?: string;
          updated_at?: string;
          vencedor_fornecedor_id?: string | null;
        };
        Update: {
          categoria_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          motivo_selecao?: string | null;
          numero?: string | null;
          observacoes?: string | null;
          status?: string;
          updated_at?: string;
          vencedor_fornecedor_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cotacoes_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cotacoes_vencedor_fornecedor_id_fkey";
            columns: ["vencedor_fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["id"];
          },
        ];
      };
      documento_sequencias: {
        Row: {
          ano: number;
          proximo: number;
          tipo: string;
        };
        Insert: {
          ano: number;
          proximo?: number;
          tipo: string;
        };
        Update: {
          ano?: number;
          proximo?: number;
          tipo?: string;
        };
        Relationships: [];
      };
      equipamento_documentos: {
        Row: {
          anexo_path: string | null;
          created_at: string;
          created_by: string | null;
          descricao: string | null;
          equipamento_id: string;
          id: string;
          tipo: string;
          updated_at: string;
          vencimento: string | null;
        };
        Insert: {
          anexo_path?: string | null;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          equipamento_id: string;
          id?: string;
          tipo: string;
          updated_at?: string;
          vencimento?: string | null;
        };
        Update: {
          anexo_path?: string | null;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          equipamento_id?: string;
          id?: string;
          tipo?: string;
          updated_at?: string;
          vencimento?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "equipamento_documentos_equipamento_id_fkey";
            columns: ["equipamento_id"];
            isOneToOne: false;
            referencedRelation: "equipamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      equipamentos: {
        Row: {
          ano: number | null;
          ativo: boolean;
          codigo: string | null;
          controle_por: string;
          created_at: string;
          created_by: string | null;
          descricao: string;
          id: string;
          marca: string | null;
          modelo: string | null;
          placa: string | null;
          tipo: string | null;
          updated_at: string;
        };
        Insert: {
          ano?: number | null;
          ativo?: boolean;
          codigo?: string | null;
          controle_por?: string;
          created_at?: string;
          created_by?: string | null;
          descricao: string;
          id?: string;
          marca?: string | null;
          modelo?: string | null;
          placa?: string | null;
          tipo?: string | null;
          updated_at?: string;
        };
        Update: {
          ano?: number | null;
          ativo?: boolean;
          codigo?: string | null;
          controle_por?: string;
          created_at?: string;
          created_by?: string | null;
          descricao?: string;
          id?: string;
          marca?: string | null;
          modelo?: string | null;
          placa?: string | null;
          tipo?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      extrato_transacoes: {
        Row: {
          chave_dedup: string | null;
          conciliada: boolean;
          conciliado_em: string | null;
          conciliado_por: string | null;
          conta_bancaria_id: string;
          created_at: string;
          data_movimento: string;
          extrato_id: string;
          fitid: string | null;
          id: string;
          memo: string | null;
          parcela_id: string | null;
          tipo: string;
          valor: number;
        };
        Insert: {
          chave_dedup?: string | null;
          conciliada?: boolean;
          conciliado_em?: string | null;
          conciliado_por?: string | null;
          conta_bancaria_id: string;
          created_at?: string;
          data_movimento: string;
          extrato_id: string;
          fitid?: string | null;
          id?: string;
          memo?: string | null;
          parcela_id?: string | null;
          tipo: string;
          valor: number;
        };
        Update: {
          chave_dedup?: string | null;
          conciliada?: boolean;
          conciliado_em?: string | null;
          conciliado_por?: string | null;
          conta_bancaria_id?: string;
          created_at?: string;
          data_movimento?: string;
          extrato_id?: string;
          fitid?: string | null;
          id?: string;
          memo?: string | null;
          parcela_id?: string | null;
          tipo?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "extrato_transacoes_conciliado_por_fkey";
            columns: ["conciliado_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extrato_transacoes_conta_bancaria_id_fkey";
            columns: ["conta_bancaria_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extrato_transacoes_extrato_id_fkey";
            columns: ["extrato_id"];
            isOneToOne: false;
            referencedRelation: "extratos_ofx";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extrato_transacoes_parcela_id_fkey";
            columns: ["parcela_id"];
            isOneToOne: false;
            referencedRelation: "lancamento_parcelas";
            referencedColumns: ["id"];
          },
        ];
      };
      extratos_ofx: {
        Row: {
          conta_bancaria_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          importado_em: string;
          nome_arquivo: string | null;
          periodo_fim: string | null;
          periodo_inicio: string | null;
        };
        Insert: {
          conta_bancaria_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          importado_em?: string;
          nome_arquivo?: string | null;
          periodo_fim?: string | null;
          periodo_inicio?: string | null;
        };
        Update: {
          conta_bancaria_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          importado_em?: string;
          nome_arquivo?: string | null;
          periodo_fim?: string | null;
          periodo_inicio?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "extratos_ofx_conta_bancaria_id_fkey";
            columns: ["conta_bancaria_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
        ];
      };
      folha_encargos: {
        Row: {
          ativo: boolean;
          created_at: string;
          created_by: string | null;
          grupo_recolhimento: string | null;
          id: string;
          nome: string;
          percentual: number;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          grupo_recolhimento?: string | null;
          id?: string;
          nome: string;
          percentual: number;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          grupo_recolhimento?: string | null;
          id?: string;
          nome?: string;
          percentual?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      folha_exclusoes: {
        Row: {
          colaborador_id: string;
          created_at: string;
          created_by: string | null;
          folha_id: string;
          motivo: string | null;
        };
        Insert: {
          colaborador_id: string;
          created_at?: string;
          created_by?: string | null;
          folha_id: string;
          motivo?: string | null;
        };
        Update: {
          colaborador_id?: string;
          created_at?: string;
          created_by?: string | null;
          folha_id?: string;
          motivo?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "folha_exclusoes_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folha_exclusoes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folha_exclusoes_folha_id_fkey";
            columns: ["folha_id"];
            isOneToOne: false;
            referencedRelation: "folhas";
            referencedColumns: ["id"];
          },
        ];
      };
      folha_guias: {
        Row: {
          created_at: string;
          folha_id: string;
          grupo: string;
          id: string;
          lancamento_id: string | null;
          valor: number;
        };
        Insert: {
          created_at?: string;
          folha_id: string;
          grupo: string;
          id?: string;
          lancamento_id?: string | null;
          valor: number;
        };
        Update: {
          created_at?: string;
          folha_id?: string;
          grupo?: string;
          id?: string;
          lancamento_id?: string | null;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "folha_guias_folha_id_fkey";
            columns: ["folha_id"];
            isOneToOne: false;
            referencedRelation: "folhas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folha_guias_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      folha_inss_faixas: {
        Row: {
          aliquota: number;
          created_at: string;
          created_by: string | null;
          id: string;
          limite_ate: number;
          updated_at: string;
        };
        Insert: {
          aliquota: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          limite_ate: number;
          updated_at?: string;
        };
        Update: {
          aliquota?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          limite_ate?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      folha_irrf_faixas: {
        Row: {
          aliquota: number;
          created_at: string;
          created_by: string | null;
          id: string;
          limite_ate: number;
          parcela_deduzir: number;
          updated_at: string;
        };
        Insert: {
          aliquota: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          limite_ate: number;
          parcela_deduzir: number;
          updated_at?: string;
        };
        Update: {
          aliquota?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          limite_ate?: number;
          parcela_deduzir?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      folha_item_encargos: {
        Row: {
          folha_item_id: string;
          grupo_recolhimento: string | null;
          id: string;
          nome: string;
          percentual: number;
          valor: number;
        };
        Insert: {
          folha_item_id: string;
          grupo_recolhimento?: string | null;
          id?: string;
          nome: string;
          percentual: number;
          valor: number;
        };
        Update: {
          folha_item_id?: string;
          grupo_recolhimento?: string | null;
          id?: string;
          nome?: string;
          percentual?: number;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "folha_item_encargos_folha_item_id_fkey";
            columns: ["folha_item_id"];
            isOneToOne: false;
            referencedRelation: "folha_itens";
            referencedColumns: ["id"];
          },
        ];
      };
      folha_item_provisoes: {
        Row: {
          folha_item_id: string;
          id: string;
          nome: string;
          percentual: number;
          valor_encargos: number;
          valor_principal: number;
        };
        Insert: {
          folha_item_id: string;
          id?: string;
          nome: string;
          percentual: number;
          valor_encargos?: number;
          valor_principal: number;
        };
        Update: {
          folha_item_id?: string;
          id?: string;
          nome?: string;
          percentual?: number;
          valor_encargos?: number;
          valor_principal?: number;
        };
        Relationships: [
          {
            foreignKeyName: "folha_item_provisoes_folha_item_id_fkey";
            columns: ["folha_item_id"];
            isOneToOne: false;
            referencedRelation: "folha_itens";
            referencedColumns: ["id"];
          },
        ];
      };
      folha_itens: {
        Row: {
          adiantamentos: number;
          centro_custo_id: string | null;
          colaborador_id: string;
          created_at: string;
          custo_total: number;
          desconto_horas: number | null;
          descontos: number;
          dias_trabalhados: number | null;
          editado_manualmente: boolean;
          encargos: number;
          encargos_percentual: number | null;
          folha_id: string;
          gratificacao: number;
          horas_extras: number;
          horas_normais: number;
          id: string;
          inss: number;
          irrf: number;
          lancamento_id: string | null;
          provisoes: number;
          salario_base: number;
          valor_extras: number;
          valor_liquido: number;
        };
        Insert: {
          adiantamentos?: number;
          centro_custo_id?: string | null;
          colaborador_id: string;
          created_at?: string;
          custo_total?: number;
          desconto_horas?: number | null;
          descontos?: number;
          dias_trabalhados?: number | null;
          editado_manualmente?: boolean;
          encargos?: number;
          encargos_percentual?: number | null;
          folha_id: string;
          gratificacao?: number;
          horas_extras?: number;
          horas_normais?: number;
          id?: string;
          inss?: number;
          irrf?: number;
          lancamento_id?: string | null;
          provisoes?: number;
          salario_base?: number;
          valor_extras?: number;
          valor_liquido?: number;
        };
        Update: {
          adiantamentos?: number;
          centro_custo_id?: string | null;
          colaborador_id?: string;
          created_at?: string;
          custo_total?: number;
          desconto_horas?: number | null;
          descontos?: number;
          dias_trabalhados?: number | null;
          editado_manualmente?: boolean;
          encargos?: number;
          encargos_percentual?: number | null;
          folha_id?: string;
          gratificacao?: number;
          horas_extras?: number;
          horas_normais?: number;
          id?: string;
          inss?: number;
          irrf?: number;
          lancamento_id?: string | null;
          provisoes?: number;
          salario_base?: number;
          valor_extras?: number;
          valor_liquido?: number;
        };
        Relationships: [
          {
            foreignKeyName: "folha_itens_centro_custo_id_fkey";
            columns: ["centro_custo_id"];
            isOneToOne: false;
            referencedRelation: "centros_custo";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folha_itens_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folha_itens_folha_id_fkey";
            columns: ["folha_id"];
            isOneToOne: false;
            referencedRelation: "folhas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "folha_itens_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      folha_parametros: {
        Row: {
          aviso_previo_dias_base: number;
          aviso_previo_dias_por_ano: number;
          aviso_previo_dias_teto: number;
          created_at: string;
          created_by: string | null;
          dia_pagamento_salario: number | null;
          dia_vencimento_guias: number | null;
          fgts_percentual: number;
          grupo_recolhimento_inss: string | null;
          grupo_recolhimento_irrf: string | null;
          id: number;
          irrf_deducao_por_dependente: number;
          irrf_desconto_simplificado: number;
          multa_fgts_percentual: number;
          updated_at: string;
        };
        Insert: {
          aviso_previo_dias_base?: number;
          aviso_previo_dias_por_ano?: number;
          aviso_previo_dias_teto?: number;
          created_at?: string;
          created_by?: string | null;
          dia_pagamento_salario?: number | null;
          dia_vencimento_guias?: number | null;
          fgts_percentual?: number;
          grupo_recolhimento_inss?: string | null;
          grupo_recolhimento_irrf?: string | null;
          id?: number;
          irrf_deducao_por_dependente?: number;
          irrf_desconto_simplificado?: number;
          multa_fgts_percentual?: number;
          updated_at?: string;
        };
        Update: {
          aviso_previo_dias_base?: number;
          aviso_previo_dias_por_ano?: number;
          aviso_previo_dias_teto?: number;
          created_at?: string;
          created_by?: string | null;
          dia_pagamento_salario?: number | null;
          dia_vencimento_guias?: number | null;
          fgts_percentual?: number;
          grupo_recolhimento_inss?: string | null;
          grupo_recolhimento_irrf?: string | null;
          id?: number;
          irrf_deducao_por_dependente?: number;
          irrf_desconto_simplificado?: number;
          multa_fgts_percentual?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      folha_provisoes: {
        Row: {
          ativo: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          nome: string;
          percentual: number;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome: string;
          percentual: number;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome?: string;
          percentual?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folha_provisoes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      folhas: {
        Row: {
          aprovado_em: string | null;
          aprovado_por: string | null;
          competencia: string;
          created_at: string;
          created_by: string | null;
          custo_total: number;
          data_vencimento: string | null;
          encargos_percentual: number;
          id: string;
          motivo_rejeicao: string | null;
          status: string;
          updated_at: string;
          valor_adiantamentos: number;
          valor_bruto: number;
          valor_descontos: number;
          valor_encargos: number;
          valor_gratificacoes: number;
          valor_liquido: number;
          valor_provisoes: number;
        };
        Insert: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          competencia: string;
          created_at?: string;
          created_by?: string | null;
          custo_total?: number;
          data_vencimento?: string | null;
          encargos_percentual?: number;
          id?: string;
          motivo_rejeicao?: string | null;
          status?: string;
          updated_at?: string;
          valor_adiantamentos?: number;
          valor_bruto?: number;
          valor_descontos?: number;
          valor_encargos?: number;
          valor_gratificacoes?: number;
          valor_liquido?: number;
          valor_provisoes?: number;
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          competencia?: string;
          created_at?: string;
          created_by?: string | null;
          custo_total?: number;
          data_vencimento?: string | null;
          encargos_percentual?: number;
          id?: string;
          motivo_rejeicao?: string | null;
          status?: string;
          updated_at?: string;
          valor_adiantamentos?: number;
          valor_bruto?: number;
          valor_descontos?: number;
          valor_encargos?: number;
          valor_gratificacoes?: number;
          valor_liquido?: number;
          valor_provisoes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "folhas_aprovado_por_fkey";
            columns: ["aprovado_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      formas_pagamento: {
        Row: {
          ativo: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          nome: string;
          tipo: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome: string;
          tipo?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome?: string;
          tipo?: string;
        };
        Relationships: [];
      };
      fornecedores: {
        Row: {
          ativo: boolean;
          cidade: string | null;
          cnpj_cpf: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          endereco: string | null;
          id: string;
          inscricao_estadual: string | null;
          nome_fantasia: string | null;
          observacoes: string | null;
          razao_social: string;
          telefone: string | null;
          tipo: string;
          uf: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          cidade?: string | null;
          cnpj_cpf?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          endereco?: string | null;
          id?: string;
          inscricao_estadual?: string | null;
          nome_fantasia?: string | null;
          observacoes?: string | null;
          razao_social: string;
          telefone?: string | null;
          tipo?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          cidade?: string | null;
          cnpj_cpf?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          endereco?: string | null;
          id?: string;
          inscricao_estadual?: string | null;
          nome_fantasia?: string | null;
          observacoes?: string | null;
          razao_social?: string;
          telefone?: string | null;
          tipo?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      funcoes: {
        Row: {
          ativo: boolean;
          cbo: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          nome: string;
          salario_base: number | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          cbo?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome: string;
          salario_base?: number | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          cbo?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome?: string;
          salario_base?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      insumo_grupos: {
        Row: {
          cor: string;
          created_at: string;
          id: string;
          nome: string;
          ordem: number;
          slug: string;
          updated_at: string;
        };
        Insert: {
          cor?: string;
          created_at?: string;
          id?: string;
          nome: string;
          ordem: number;
          slug: string;
          updated_at?: string;
        };
        Update: {
          cor?: string;
          created_at?: string;
          id?: string;
          nome?: string;
          ordem?: number;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      insumos: {
        Row: {
          ativo: boolean;
          categoria_financeira_id: string | null;
          categoria_id: string;
          codigo: string | null;
          created_at: string;
          created_by: string | null;
          descricao: string | null;
          id: string;
          nome: string;
          unidade_id: string;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          categoria_financeira_id?: string | null;
          categoria_id: string;
          codigo?: string | null;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          nome: string;
          unidade_id: string;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          categoria_financeira_id?: string | null;
          categoria_id?: string;
          codigo?: string | null;
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          nome?: string;
          unidade_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "insumos_categoria_financeira_id_fkey";
            columns: ["categoria_financeira_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insumos_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias_insumo";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "insumos_unidade_id_fkey";
            columns: ["unidade_id"];
            isOneToOne: false;
            referencedRelation: "unidades_medida";
            referencedColumns: ["id"];
          },
        ];
      };
      jornadas: {
        Row: {
          ativo: boolean;
          created_at: string;
          created_by: string | null;
          horas_domingo: number;
          horas_quarta: number;
          horas_quinta: number;
          horas_sabado: number;
          horas_segunda: number;
          horas_sexta: number;
          horas_terca: number;
          id: string;
          nome: string;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          horas_domingo?: number;
          horas_quarta?: number;
          horas_quinta?: number;
          horas_sabado?: number;
          horas_segunda?: number;
          horas_sexta?: number;
          horas_terca?: number;
          id?: string;
          nome: string;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          horas_domingo?: number;
          horas_quarta?: number;
          horas_quinta?: number;
          horas_sabado?: number;
          horas_segunda?: number;
          horas_sexta?: number;
          horas_terca?: number;
          id?: string;
          nome?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lancamento_formas: {
        Row: {
          cartao_id: string | null;
          created_at: string;
          created_by: string | null;
          forma_pagamento_id: string;
          id: string;
          lancamento_id: string;
          updated_at: string;
          valor: number;
        };
        Insert: {
          cartao_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento_id: string;
          id?: string;
          lancamento_id: string;
          updated_at?: string;
          valor: number;
        };
        Update: {
          cartao_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento_id?: string;
          id?: string;
          lancamento_id?: string;
          updated_at?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lancamento_formas_cartao_id_fkey";
            columns: ["cartao_id"];
            isOneToOne: false;
            referencedRelation: "cartoes_credito";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamento_formas_forma_pagamento_id_fkey";
            columns: ["forma_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "formas_pagamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamento_formas_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      lancamento_parcelas: {
        Row: {
          aprovado_em: string | null;
          aprovado_por: string | null;
          conferido_em: string | null;
          conferido_por: string | null;
          conta_bancaria_id: string | null;
          created_at: string;
          created_by: string | null;
          data_pagamento: string | null;
          data_programada: string | null;
          data_programada_origem: string | null;
          data_vencimento: string | null;
          desconto: number;
          id: string;
          juros: number;
          lancamento_forma_id: string | null;
          lancamento_id: string;
          numero_parcela: number;
          outras_despesas: number;
          pago_em: string | null;
          pago_por: string | null;
          status: string;
          updated_at: string;
          valor: number;
          valor_liquido: number | null;
        };
        Insert: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          conferido_em?: string | null;
          conferido_por?: string | null;
          conta_bancaria_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_pagamento?: string | null;
          data_programada?: string | null;
          data_programada_origem?: string | null;
          data_vencimento?: string | null;
          desconto?: number;
          id?: string;
          juros?: number;
          lancamento_forma_id?: string | null;
          lancamento_id: string;
          numero_parcela?: number;
          outras_despesas?: number;
          pago_em?: string | null;
          pago_por?: string | null;
          status?: string;
          updated_at?: string;
          valor: number;
          valor_liquido?: number | null;
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          conferido_em?: string | null;
          conferido_por?: string | null;
          conta_bancaria_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_pagamento?: string | null;
          data_programada?: string | null;
          data_programada_origem?: string | null;
          data_vencimento?: string | null;
          desconto?: number;
          id?: string;
          juros?: number;
          lancamento_forma_id?: string | null;
          lancamento_id?: string;
          numero_parcela?: number;
          outras_despesas?: number;
          pago_em?: string | null;
          pago_por?: string | null;
          status?: string;
          updated_at?: string;
          valor?: number;
          valor_liquido?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "lancamento_parcelas_aprovado_por_fkey";
            columns: ["aprovado_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamento_parcelas_conferido_por_fkey";
            columns: ["conferido_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamento_parcelas_conta_bancaria_id_fkey";
            columns: ["conta_bancaria_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamento_parcelas_lancamento_forma_id_fkey";
            columns: ["lancamento_forma_id"];
            isOneToOne: false;
            referencedRelation: "lancamento_formas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamento_parcelas_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamento_parcelas_pago_por_fkey";
            columns: ["pago_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      lancamento_rateios: {
        Row: {
          categoria_id: string | null;
          centro_custo_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          lancamento_id: string;
          valor: number;
        };
        Insert: {
          categoria_id?: string | null;
          centro_custo_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lancamento_id: string;
          valor: number;
        };
        Update: {
          categoria_id?: string | null;
          centro_custo_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          lancamento_id?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lancamento_rateios_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamento_rateios_centro_custo_id_fkey";
            columns: ["centro_custo_id"];
            isOneToOne: false;
            referencedRelation: "centros_custo";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamento_rateios_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      lancamentos: {
        Row: {
          categoria_id: string | null;
          centro_custo_id: string | null;
          cliente_id: string | null;
          colaborador_id: string | null;
          condicao_pagamento_id: string | null;
          created_at: string;
          created_by: string | null;
          data_compra: string;
          data_vencimento: string | null;
          descricao: string;
          e_divida: boolean;
          forma_pagamento_id: string | null;
          fornecedor_id: string | null;
          id: string;
          mes_competencia: string;
          numero: string;
          numero_documento: string | null;
          observacoes: string | null;
          origem: string;
          origem_id: string | null;
          retencao_cofins: number;
          retencao_csll: number;
          retencao_inss: number;
          retencao_ir: number;
          retencao_iss: number;
          retencao_outras: number;
          retencao_pis: number;
          status: string;
          tipo: string;
          updated_at: string;
          valor: number;
          valor_bruto: number | null;
        };
        Insert: {
          categoria_id?: string | null;
          centro_custo_id?: string | null;
          cliente_id?: string | null;
          colaborador_id?: string | null;
          condicao_pagamento_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_compra?: string;
          data_vencimento?: string | null;
          descricao: string;
          e_divida?: boolean;
          forma_pagamento_id?: string | null;
          fornecedor_id?: string | null;
          id?: string;
          mes_competencia?: string;
          numero: string;
          numero_documento?: string | null;
          observacoes?: string | null;
          origem: string;
          origem_id?: string | null;
          retencao_cofins?: number;
          retencao_csll?: number;
          retencao_inss?: number;
          retencao_ir?: number;
          retencao_iss?: number;
          retencao_outras?: number;
          retencao_pis?: number;
          status?: string;
          tipo?: string;
          updated_at?: string;
          valor: number;
          valor_bruto?: number | null;
        };
        Update: {
          categoria_id?: string | null;
          centro_custo_id?: string | null;
          cliente_id?: string | null;
          colaborador_id?: string | null;
          condicao_pagamento_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_compra?: string;
          data_vencimento?: string | null;
          descricao?: string;
          e_divida?: boolean;
          forma_pagamento_id?: string | null;
          fornecedor_id?: string | null;
          id?: string;
          mes_competencia?: string;
          numero?: string;
          numero_documento?: string | null;
          observacoes?: string | null;
          origem?: string;
          origem_id?: string | null;
          retencao_cofins?: number;
          retencao_csll?: number;
          retencao_inss?: number;
          retencao_ir?: number;
          retencao_iss?: number;
          retencao_outras?: number;
          retencao_pis?: number;
          status?: string;
          tipo?: string;
          updated_at?: string;
          valor?: number;
          valor_bruto?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "lancamentos_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_centro_custo_id_fkey";
            columns: ["centro_custo_id"];
            isOneToOne: false;
            referencedRelation: "centros_custo";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_condicao_pagamento_id_fkey";
            columns: ["condicao_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "condicoes_pagamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_forma_pagamento_id_fkey";
            columns: ["forma_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "formas_pagamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lancamentos_fornecedor_id_fkey";
            columns: ["fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["id"];
          },
        ];
      };
      lancamentos_numero_reparo: {
        Row: {
          lancamento_id: string;
          numero_antigo: string;
          numero_novo: string;
          reparado_em: string;
        };
        Insert: {
          lancamento_id: string;
          numero_antigo: string;
          numero_novo: string;
          reparado_em?: string;
        };
        Update: {
          lancamento_id?: string;
          numero_antigo?: string;
          numero_novo?: string;
          reparado_em?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lancamentos_numero_reparo_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: true;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      lixeira: {
        Row: {
          dados: Json;
          excluido_em: string;
          excluido_por: string;
          id: string;
          motivo: string;
          registro_id: string;
          restaurado_em: string | null;
          restaurado_por: string | null;
          tabela: string;
        };
        Insert: {
          dados: Json;
          excluido_em?: string;
          excluido_por: string;
          id?: string;
          motivo: string;
          registro_id: string;
          restaurado_em?: string | null;
          restaurado_por?: string | null;
          tabela: string;
        };
        Update: {
          dados?: Json;
          excluido_em?: string;
          excluido_por?: string;
          id?: string;
          motivo?: string;
          registro_id?: string;
          restaurado_em?: string | null;
          restaurado_por?: string | null;
          tabela?: string;
        };
        Relationships: [];
      };
      obras: {
        Row: {
          ativo: boolean;
          cliente_id: string | null;
          created_at: string;
          created_by: string | null;
          data_fim_prevista: string | null;
          data_inicio: string | null;
          extensao_km: number | null;
          id: string;
          lote: string | null;
          nome: string;
          numero_contrato: string | null;
          observacoes: string | null;
          rodovia: string | null;
          status: string;
          uf: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          cliente_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_fim_prevista?: string | null;
          data_inicio?: string | null;
          extensao_km?: number | null;
          id?: string;
          lote?: string | null;
          nome: string;
          numero_contrato?: string | null;
          observacoes?: string | null;
          rodovia?: string | null;
          status?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          cliente_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_fim_prevista?: string | null;
          data_inicio?: string | null;
          extensao_km?: number | null;
          id?: string;
          lote?: string | null;
          nome?: string;
          numero_contrato?: string | null;
          observacoes?: string | null;
          rodovia?: string | null;
          status?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "obras_cliente_id_fkey";
            columns: ["cliente_id"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["id"];
          },
        ];
      };
      oc_formas: {
        Row: {
          cartao_id: string | null;
          created_at: string;
          created_by: string | null;
          forma_pagamento_id: string;
          id: string;
          ordem_compra_id: string;
          updated_at: string;
          valor: number;
        };
        Insert: {
          cartao_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento_id: string;
          id?: string;
          ordem_compra_id: string;
          updated_at?: string;
          valor: number;
        };
        Update: {
          cartao_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          forma_pagamento_id?: string;
          id?: string;
          ordem_compra_id?: string;
          updated_at?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "oc_formas_cartao_id_fkey";
            columns: ["cartao_id"];
            isOneToOne: false;
            referencedRelation: "cartoes_credito";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oc_formas_forma_pagamento_id_fkey";
            columns: ["forma_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "formas_pagamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oc_formas_ordem_compra_id_fkey";
            columns: ["ordem_compra_id"];
            isOneToOne: false;
            referencedRelation: "ordens_compra";
            referencedColumns: ["id"];
          },
        ];
      };
      oc_itens: {
        Row: {
          centro_custo_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          insumo_id: string;
          ordem_compra_id: string;
          preco_unitario: number;
          quantidade: number;
        };
        Insert: {
          centro_custo_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          insumo_id: string;
          ordem_compra_id: string;
          preco_unitario: number;
          quantidade: number;
        };
        Update: {
          centro_custo_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          insumo_id?: string;
          ordem_compra_id?: string;
          preco_unitario?: number;
          quantidade?: number;
        };
        Relationships: [
          {
            foreignKeyName: "oc_itens_centro_custo_id_fkey";
            columns: ["centro_custo_id"];
            isOneToOne: false;
            referencedRelation: "centros_custo";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oc_itens_insumo_id_fkey";
            columns: ["insumo_id"];
            isOneToOne: false;
            referencedRelation: "insumos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oc_itens_ordem_compra_id_fkey";
            columns: ["ordem_compra_id"];
            isOneToOne: false;
            referencedRelation: "ordens_compra";
            referencedColumns: ["id"];
          },
        ];
      };
      oc_parcelas: {
        Row: {
          created_at: string;
          created_by: string | null;
          data_vencimento: string;
          id: string;
          numero_parcela: number;
          oc_forma_id: string | null;
          ordem_compra_id: string;
          valor: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          data_vencimento: string;
          id?: string;
          numero_parcela: number;
          oc_forma_id?: string | null;
          ordem_compra_id: string;
          valor: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          data_vencimento?: string;
          id?: string;
          numero_parcela?: number;
          oc_forma_id?: string | null;
          ordem_compra_id?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "oc_parcelas_oc_forma_id_fkey";
            columns: ["oc_forma_id"];
            isOneToOne: false;
            referencedRelation: "oc_formas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oc_parcelas_ordem_compra_id_fkey";
            columns: ["ordem_compra_id"];
            isOneToOne: false;
            referencedRelation: "ordens_compra";
            referencedColumns: ["id"];
          },
        ];
      };
      ordens_compra: {
        Row: {
          aprovado_em: string | null;
          aprovado_por: string | null;
          categoria_id: string | null;
          categoria_ids: string[];
          condicao_pagamento_id: string;
          cotacao_id: string | null;
          created_at: string;
          created_by: string | null;
          data_compra: string;
          desconto: number;
          descricao: string | null;
          forma_pagamento_id: string | null;
          fornecedor_id: string;
          frete: number;
          id: string;
          impostos: number;
          mes_competencia: string;
          motivo_rejeicao: string | null;
          numero: string | null;
          numero_documento: string | null;
          observacoes: string | null;
          outras_despesas: number;
          status: string;
          updated_at: string;
          valor_total: number;
        };
        Insert: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          categoria_id?: string | null;
          categoria_ids?: string[];
          condicao_pagamento_id: string;
          cotacao_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_compra?: string;
          desconto?: number;
          descricao?: string | null;
          forma_pagamento_id?: string | null;
          fornecedor_id: string;
          frete?: number;
          id?: string;
          impostos?: number;
          mes_competencia?: string;
          motivo_rejeicao?: string | null;
          numero?: string | null;
          numero_documento?: string | null;
          observacoes?: string | null;
          outras_despesas?: number;
          status?: string;
          updated_at?: string;
          valor_total?: number;
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          categoria_id?: string | null;
          categoria_ids?: string[];
          condicao_pagamento_id?: string;
          cotacao_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_compra?: string;
          desconto?: number;
          descricao?: string | null;
          forma_pagamento_id?: string | null;
          fornecedor_id?: string;
          frete?: number;
          id?: string;
          impostos?: number;
          mes_competencia?: string;
          motivo_rejeicao?: string | null;
          numero?: string | null;
          numero_documento?: string | null;
          observacoes?: string | null;
          outras_despesas?: number;
          status?: string;
          updated_at?: string;
          valor_total?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ordens_compra_aprovado_por_fkey";
            columns: ["aprovado_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_categoria_id_fkey";
            columns: ["categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias_financeiras";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_condicao_pagamento_id_fkey";
            columns: ["condicao_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "condicoes_pagamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_cotacao_id_fkey";
            columns: ["cotacao_id"];
            isOneToOne: false;
            referencedRelation: "cotacoes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_forma_pagamento_id_fkey";
            columns: ["forma_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "formas_pagamento";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ordens_compra_fornecedor_id_fkey";
            columns: ["fornecedor_id"];
            isOneToOne: false;
            referencedRelation: "fornecedores";
            referencedColumns: ["id"];
          },
        ];
      };
      parcela_eventos: {
        Row: {
          created_at: string;
          created_by: string | null;
          data_de: string | null;
          data_para: string | null;
          id: string;
          motivo: string | null;
          parcela_id: string;
          tipo: string;
          valor_de: number | null;
          valor_para: number | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          data_de?: string | null;
          data_para?: string | null;
          id?: string;
          motivo?: string | null;
          parcela_id: string;
          tipo: string;
          valor_de?: number | null;
          valor_para?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          data_de?: string | null;
          data_para?: string | null;
          id?: string;
          motivo?: string | null;
          parcela_id?: string;
          tipo?: string;
          valor_de?: number | null;
          valor_para?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "parcela_eventos_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parcela_eventos_parcela_id_fkey";
            columns: ["parcela_id"];
            isOneToOne: false;
            referencedRelation: "lancamento_parcelas";
            referencedColumns: ["id"];
          },
        ];
      };
      perfil_permissoes: {
        Row: {
          acao: string;
          created_at: string;
          created_by: string | null;
          id: string;
          perfil_id: string;
          recurso: string;
        };
        Insert: {
          acao: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          perfil_id: string;
          recurso: string;
        };
        Update: {
          acao?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          perfil_id?: string;
          recurso?: string;
        };
        Relationships: [
          {
            foreignKeyName: "perfil_permissoes_perfil_id_fkey";
            columns: ["perfil_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
      perfis: {
        Row: {
          created_at: string;
          created_by: string | null;
          descricao: string | null;
          id: string;
          nome: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          nome: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          descricao?: string | null;
          id?: string;
          nome?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      preferencias_tabela: {
        Row: {
          preferencia: Json;
          tabela: string;
          updated_at: string;
          usuario_id: string;
        };
        Insert: {
          preferencia: Json;
          tabela: string;
          updated_at?: string;
          usuario_id: string;
        };
        Update: {
          preferencia?: Json;
          tabela?: string;
          updated_at?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "preferencias_tabela_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      rateio_eventos: {
        Row: {
          antes: Json;
          created_at: string;
          created_by: string | null;
          depois: Json;
          id: string;
          lancamento_id: string;
          motivo: string;
        };
        Insert: {
          antes: Json;
          created_at?: string;
          created_by?: string | null;
          depois: Json;
          id?: string;
          lancamento_id: string;
          motivo: string;
        };
        Update: {
          antes?: Json;
          created_at?: string;
          created_by?: string | null;
          depois?: Json;
          id?: string;
          lancamento_id?: string;
          motivo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rateio_eventos_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rateio_eventos_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      recebimentos: {
        Row: {
          created_at: string;
          created_by: string | null;
          data_recebimento: string;
          divergencia_valor: number | null;
          id: string;
          lancamento_id: string;
          numero_nf: string;
          ordem_compra_id: string;
          valor_nf: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          data_recebimento: string;
          divergencia_valor?: number | null;
          id?: string;
          lancamento_id: string;
          numero_nf: string;
          ordem_compra_id: string;
          valor_nf: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          data_recebimento?: string;
          divergencia_valor?: number | null;
          id?: string;
          lancamento_id?: string;
          numero_nf?: string;
          ordem_compra_id?: string;
          valor_nf?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recebimentos_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recebimentos_ordem_compra_id_fkey";
            columns: ["ordem_compra_id"];
            isOneToOne: true;
            referencedRelation: "ordens_compra";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_adiantamento_parcelas: {
        Row: {
          adiantamento_id: string;
          competencia: string;
          created_at: string;
          folha_id: string | null;
          gerada_por_folha_id: string | null;
          id: string;
          numero: number;
          valor_descontado: number;
          valor_previsto: number;
        };
        Insert: {
          adiantamento_id: string;
          competencia: string;
          created_at?: string;
          folha_id?: string | null;
          gerada_por_folha_id?: string | null;
          id?: string;
          numero: number;
          valor_descontado?: number;
          valor_previsto: number;
        };
        Update: {
          adiantamento_id?: string;
          competencia?: string;
          created_at?: string;
          folha_id?: string | null;
          gerada_por_folha_id?: string | null;
          id?: string;
          numero?: number;
          valor_descontado?: number;
          valor_previsto?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rh_adiantamento_parcelas_adiantamento_id_fkey";
            columns: ["adiantamento_id"];
            isOneToOne: false;
            referencedRelation: "rh_adiantamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_adiantamento_parcelas_folha_id_fkey";
            columns: ["folha_id"];
            isOneToOne: false;
            referencedRelation: "folhas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_adiantamento_parcelas_gerada_por_folha_id_fkey";
            columns: ["gerada_por_folha_id"];
            isOneToOne: false;
            referencedRelation: "folhas";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_adiantamentos: {
        Row: {
          colaborador_id: string;
          competencia: string;
          created_at: string;
          created_by: string | null;
          data: string;
          descricao: string | null;
          id: string;
          lancamento_id: string | null;
          updated_at: string;
          valor: number;
        };
        Insert: {
          colaborador_id: string;
          competencia: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          descricao?: string | null;
          id?: string;
          lancamento_id?: string | null;
          updated_at?: string;
          valor: number;
        };
        Update: {
          colaborador_id?: string;
          competencia?: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          descricao?: string | null;
          id?: string;
          lancamento_id?: string | null;
          updated_at?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rh_adiantamentos_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_adiantamentos_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_apontamentos: {
        Row: {
          colaborador_id: string;
          created_at: string;
          horas_extras: number;
          horas_normais: number;
          id: string;
          observacao: string | null;
          ponto_id: string;
          tipo: string;
          updated_at: string;
        };
        Insert: {
          colaborador_id: string;
          created_at?: string;
          horas_extras?: number;
          horas_normais?: number;
          id?: string;
          observacao?: string | null;
          ponto_id: string;
          tipo?: string;
          updated_at?: string;
        };
        Update: {
          colaborador_id?: string;
          created_at?: string;
          horas_extras?: number;
          horas_normais?: number;
          id?: string;
          observacao?: string | null;
          ponto_id?: string;
          tipo?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rh_apontamentos_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_apontamentos_ponto_id_fkey";
            columns: ["ponto_id"];
            isOneToOne: false;
            referencedRelation: "rh_pontos";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_dependentes: {
        Row: {
          colaborador_id: string;
          cpf: string | null;
          created_at: string;
          created_by: string | null;
          data_nascimento: string | null;
          dependente_irrf: boolean;
          dependente_salario_familia: boolean;
          id: string;
          nome: string;
          parentesco: string | null;
          updated_at: string;
        };
        Insert: {
          colaborador_id: string;
          cpf?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_nascimento?: string | null;
          dependente_irrf?: boolean;
          dependente_salario_familia?: boolean;
          id?: string;
          nome: string;
          parentesco?: string | null;
          updated_at?: string;
        };
        Update: {
          colaborador_id?: string;
          cpf?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_nascimento?: string | null;
          dependente_irrf?: boolean;
          dependente_salario_familia?: boolean;
          id?: string;
          nome?: string;
          parentesco?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rh_dependentes_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_diarias: {
        Row: {
          colaborador_id: string;
          competencia: string;
          created_at: string;
          created_by: string | null;
          data: string;
          folha_id: string | null;
          id: string;
          lancamento_id: string | null;
          obra_id: string | null;
          observacao: string | null;
          updated_at: string;
          valor: number;
        };
        Insert: {
          colaborador_id: string;
          competencia: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          folha_id?: string | null;
          id?: string;
          lancamento_id?: string | null;
          obra_id?: string | null;
          observacao?: string | null;
          updated_at?: string;
          valor: number;
        };
        Update: {
          colaborador_id?: string;
          competencia?: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          folha_id?: string | null;
          id?: string;
          lancamento_id?: string | null;
          obra_id?: string | null;
          observacao?: string | null;
          updated_at?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rh_diarias_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_diarias_folha_id_fkey";
            columns: ["folha_id"];
            isOneToOne: false;
            referencedRelation: "folhas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_diarias_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_diarias_obra_id_fkey";
            columns: ["obra_id"];
            isOneToOne: false;
            referencedRelation: "obras";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_documentos: {
        Row: {
          colaborador_id: string;
          created_at: string;
          created_by: string | null;
          data_emissao: string | null;
          data_vencimento: string | null;
          descricao: string;
          id: string;
          observacao: string | null;
          tipo: string;
          updated_at: string;
        };
        Insert: {
          colaborador_id: string;
          created_at?: string;
          created_by?: string | null;
          data_emissao?: string | null;
          data_vencimento?: string | null;
          descricao: string;
          id?: string;
          observacao?: string | null;
          tipo: string;
          updated_at?: string;
        };
        Update: {
          colaborador_id?: string;
          created_at?: string;
          created_by?: string | null;
          data_emissao?: string | null;
          data_vencimento?: string | null;
          descricao?: string;
          id?: string;
          observacao?: string | null;
          tipo?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rh_documentos_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_epis: {
        Row: {
          assinado: boolean;
          ca: string | null;
          colaborador_id: string;
          created_at: string;
          created_by: string | null;
          data_devolucao: string | null;
          data_entrega: string;
          descricao: string;
          id: string;
          observacao: string | null;
          quantidade: number;
          updated_at: string;
        };
        Insert: {
          assinado?: boolean;
          ca?: string | null;
          colaborador_id: string;
          created_at?: string;
          created_by?: string | null;
          data_devolucao?: string | null;
          data_entrega?: string;
          descricao: string;
          id?: string;
          observacao?: string | null;
          quantidade?: number;
          updated_at?: string;
        };
        Update: {
          assinado?: boolean;
          ca?: string | null;
          colaborador_id?: string;
          created_at?: string;
          created_by?: string | null;
          data_devolucao?: string | null;
          data_entrega?: string;
          descricao?: string;
          id?: string;
          observacao?: string | null;
          quantidade?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rh_epis_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_ferias: {
        Row: {
          colaborador_id: string;
          created_at: string;
          created_by: string | null;
          data_fim: string | null;
          data_inicio: string | null;
          dias: number;
          id: string;
          observacao: string | null;
          periodo_aquisitivo_fim: string;
          periodo_aquisitivo_inicio: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          colaborador_id: string;
          created_at?: string;
          created_by?: string | null;
          data_fim?: string | null;
          data_inicio?: string | null;
          dias?: number;
          id?: string;
          observacao?: string | null;
          periodo_aquisitivo_fim: string;
          periodo_aquisitivo_inicio: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          colaborador_id?: string;
          created_at?: string;
          created_by?: string | null;
          data_fim?: string | null;
          data_inicio?: string | null;
          dias?: number;
          id?: string;
          observacao?: string | null;
          periodo_aquisitivo_fim?: string;
          periodo_aquisitivo_inicio?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rh_ferias_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_ocorrencias: {
        Row: {
          colaborador_id: string;
          created_at: string;
          created_by: string | null;
          data: string;
          data_fim: string | null;
          descricao: string;
          id: string;
          observacao: string | null;
          tipo: string;
          updated_at: string;
        };
        Insert: {
          colaborador_id: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          data_fim?: string | null;
          descricao: string;
          id?: string;
          observacao?: string | null;
          tipo: string;
          updated_at?: string;
        };
        Update: {
          colaborador_id?: string;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          data_fim?: string | null;
          descricao?: string;
          id?: string;
          observacao?: string | null;
          tipo?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rh_ocorrencias_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_pontos: {
        Row: {
          aprovado_em: string | null;
          aprovado_por: string | null;
          created_at: string;
          created_by: string | null;
          data: string;
          encarregado_id: string | null;
          id: string;
          obra_id: string;
          observacao: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          created_at?: string;
          created_by?: string | null;
          data: string;
          encarregado_id?: string | null;
          id?: string;
          obra_id: string;
          observacao?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          created_at?: string;
          created_by?: string | null;
          data?: string;
          encarregado_id?: string | null;
          id?: string;
          obra_id?: string;
          observacao?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rh_pontos_encarregado_id_fkey";
            columns: ["encarregado_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_pontos_obra_id_fkey";
            columns: ["obra_id"];
            isOneToOne: false;
            referencedRelation: "obras";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_rescisao_itens: {
        Row: {
          codigo: string | null;
          created_at: string;
          descricao: string;
          editado_manualmente: boolean;
          id: string;
          natureza: string;
          ordem: number;
          referencia: string | null;
          rescisao_id: string;
          valor: number;
        };
        Insert: {
          codigo?: string | null;
          created_at?: string;
          descricao: string;
          editado_manualmente?: boolean;
          id?: string;
          natureza: string;
          ordem?: number;
          referencia?: string | null;
          rescisao_id: string;
          valor?: number;
        };
        Update: {
          codigo?: string | null;
          created_at?: string;
          descricao?: string;
          editado_manualmente?: boolean;
          id?: string;
          natureza?: string;
          ordem?: number;
          referencia?: string | null;
          rescisao_id?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rh_rescisao_itens_rescisao_id_fkey";
            columns: ["rescisao_id"];
            isOneToOne: false;
            referencedRelation: "rh_rescisoes";
            referencedColumns: ["id"];
          },
        ];
      };
      rh_rescisoes: {
        Row: {
          aprovado_em: string | null;
          aprovado_por: string | null;
          aviso: string;
          centro_custo_id: string | null;
          colaborador_id: string;
          created_at: string;
          created_by: string | null;
          data_aviso: string | null;
          data_desligamento: string;
          data_vencimento: string | null;
          excluido_em: string | null;
          excluido_por: string | null;
          ferias_vencidas_periodos: number;
          id: string;
          lancamento_id: string | null;
          motivo_exclusao: string | null;
          motivo_rejeicao: string | null;
          numero: string;
          observacao: string | null;
          remuneracao_base: number;
          saldo_fgts: number;
          status: string;
          tipo: string;
          updated_at: string;
          valor_descontos: number;
          valor_liquido: number;
          valor_proventos: number;
        };
        Insert: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          aviso: string;
          centro_custo_id?: string | null;
          colaborador_id: string;
          created_at?: string;
          created_by?: string | null;
          data_aviso?: string | null;
          data_desligamento: string;
          data_vencimento?: string | null;
          excluido_em?: string | null;
          excluido_por?: string | null;
          ferias_vencidas_periodos?: number;
          id?: string;
          lancamento_id?: string | null;
          motivo_exclusao?: string | null;
          motivo_rejeicao?: string | null;
          numero: string;
          observacao?: string | null;
          remuneracao_base: number;
          saldo_fgts?: number;
          status?: string;
          tipo: string;
          updated_at?: string;
          valor_descontos?: number;
          valor_liquido?: number;
          valor_proventos?: number;
        };
        Update: {
          aprovado_em?: string | null;
          aprovado_por?: string | null;
          aviso?: string;
          centro_custo_id?: string | null;
          colaborador_id?: string;
          created_at?: string;
          created_by?: string | null;
          data_aviso?: string | null;
          data_desligamento?: string;
          data_vencimento?: string | null;
          excluido_em?: string | null;
          excluido_por?: string | null;
          ferias_vencidas_periodos?: number;
          id?: string;
          lancamento_id?: string | null;
          motivo_exclusao?: string | null;
          motivo_rejeicao?: string | null;
          numero?: string;
          observacao?: string | null;
          remuneracao_base?: number;
          saldo_fgts?: number;
          status?: string;
          tipo?: string;
          updated_at?: string;
          valor_descontos?: number;
          valor_liquido?: number;
          valor_proventos?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rh_rescisoes_aprovado_por_fkey";
            columns: ["aprovado_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_rescisoes_centro_custo_id_fkey";
            columns: ["centro_custo_id"];
            isOneToOne: false;
            referencedRelation: "centros_custo";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_rescisoes_colaborador_id_fkey";
            columns: ["colaborador_id"];
            isOneToOne: false;
            referencedRelation: "colaboradores";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_rescisoes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_rescisoes_excluido_por_fkey";
            columns: ["excluido_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rh_rescisoes_lancamento_id_fkey";
            columns: ["lancamento_id"];
            isOneToOne: false;
            referencedRelation: "lancamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      transferencias_contas: {
        Row: {
          conta_destino_id: string;
          conta_origem_id: string;
          created_at: string;
          created_by: string | null;
          data_transferencia: string;
          descricao: string | null;
          id: string;
          numero: string;
          observacoes: string | null;
          tarifa: number;
          updated_at: string;
          valor: number;
        };
        Insert: {
          conta_destino_id: string;
          conta_origem_id: string;
          created_at?: string;
          created_by?: string | null;
          data_transferencia: string;
          descricao?: string | null;
          id?: string;
          numero: string;
          observacoes?: string | null;
          tarifa?: number;
          updated_at?: string;
          valor: number;
        };
        Update: {
          conta_destino_id?: string;
          conta_origem_id?: string;
          created_at?: string;
          created_by?: string | null;
          data_transferencia?: string;
          descricao?: string | null;
          id?: string;
          numero?: string;
          observacoes?: string | null;
          tarifa?: number;
          updated_at?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "transferencias_contas_conta_destino_id_fkey";
            columns: ["conta_destino_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transferencias_contas_conta_origem_id_fkey";
            columns: ["conta_origem_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
        ];
      };
      unidades_medida: {
        Row: {
          ativo: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          nome: string;
          sigla: string;
          tipo: string;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome: string;
          sigla: string;
          tipo?: string;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          nome?: string;
          sigla?: string;
          tipo?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      usuario_conta_saldo: {
        Row: {
          conta_bancaria_id: string;
          created_at: string;
          created_by: string | null;
          usuario_id: string;
        };
        Insert: {
          conta_bancaria_id: string;
          created_at?: string;
          created_by?: string | null;
          usuario_id: string;
        };
        Update: {
          conta_bancaria_id?: string;
          created_at?: string;
          created_by?: string | null;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usuario_conta_saldo_conta_bancaria_id_fkey";
            columns: ["conta_bancaria_id"];
            isOneToOne: false;
            referencedRelation: "contas_bancarias";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usuario_conta_saldo_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usuario_conta_saldo_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      usuario_permissoes: {
        Row: {
          acao: string;
          created_at: string;
          created_by: string | null;
          id: string;
          recurso: string;
          usuario_id: string;
        };
        Insert: {
          acao: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          recurso: string;
          usuario_id: string;
        };
        Update: {
          acao?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          recurso?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usuario_permissoes_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      usuario_senha_provisoria: {
        Row: {
          gerada_em: string;
          gerada_por: string | null;
          senha: string;
          usuario_id: string;
        };
        Insert: {
          gerada_em?: string;
          gerada_por?: string | null;
          senha: string;
          usuario_id: string;
        };
        Update: {
          gerada_em?: string;
          gerada_por?: string | null;
          senha?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usuario_senha_provisoria_usuario_id_fkey";
            columns: ["usuario_id"];
            isOneToOne: true;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
        ];
      };
      usuarios: {
        Row: {
          ativo: boolean;
          cargo: string | null;
          celular: string | null;
          cpf: string | null;
          created_at: string;
          created_by: string | null;
          data_nascimento: string | null;
          email: string | null;
          endereco_bairro: string | null;
          endereco_cep: string | null;
          endereco_cidade: string | null;
          endereco_complemento: string | null;
          endereco_logradouro: string | null;
          endereco_numero: string | null;
          endereco_uf: string | null;
          excluido_em: string | null;
          excluido_por: string | null;
          foto_path: string | null;
          id: string;
          nome: string;
          perfil_id: string | null;
          ramal: string | null;
          rg: string | null;
          updated_at: string;
        };
        Insert: {
          ativo?: boolean;
          cargo?: string | null;
          celular?: string | null;
          cpf?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_nascimento?: string | null;
          email?: string | null;
          endereco_bairro?: string | null;
          endereco_cep?: string | null;
          endereco_cidade?: string | null;
          endereco_complemento?: string | null;
          endereco_logradouro?: string | null;
          endereco_numero?: string | null;
          endereco_uf?: string | null;
          excluido_em?: string | null;
          excluido_por?: string | null;
          foto_path?: string | null;
          id: string;
          nome: string;
          perfil_id?: string | null;
          ramal?: string | null;
          rg?: string | null;
          updated_at?: string;
        };
        Update: {
          ativo?: boolean;
          cargo?: string | null;
          celular?: string | null;
          cpf?: string | null;
          created_at?: string;
          created_by?: string | null;
          data_nascimento?: string | null;
          email?: string | null;
          endereco_bairro?: string | null;
          endereco_cep?: string | null;
          endereco_cidade?: string | null;
          endereco_complemento?: string | null;
          endereco_logradouro?: string | null;
          endereco_numero?: string | null;
          endereco_uf?: string | null;
          excluido_em?: string | null;
          excluido_por?: string | null;
          foto_path?: string | null;
          id?: string;
          nome?: string;
          perfil_id?: string | null;
          ramal?: string | null;
          rg?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "usuarios_excluido_por_fkey";
            columns: ["excluido_por"];
            isOneToOne: false;
            referencedRelation: "usuarios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "usuarios_perfil_id_fkey";
            columns: ["perfil_id"];
            isOneToOne: false;
            referencedRelation: "perfis";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      aplicar_perfil: {
        Args: { p_perfil_id: string; p_usuario_id: string };
        Returns: undefined;
      };
      fn_adiantamento_em_folha: {
        Args: { p_adiantamento_id: string };
        Returns: boolean;
      };
      fn_adiantamento_pagamento_comprometido: {
        Args: { p_lancamento_id: string };
        Returns: boolean;
      };
      fn_adiantamentos_comprometidos: {
        Args: { p_lancamento_ids: string[] };
        Returns: string[];
      };
      fn_adiantamentos_em_folha: {
        Args: { p_adiantamento_ids: string[] };
        Returns: string[];
      };
      fn_adicionar_item_rescisao: {
        Args: {
          p_descricao: string;
          p_natureza: string;
          p_rescisao: string;
          p_valor: number;
        };
        Returns: string;
      };
      fn_alterar_mes_competencia: {
        Args: { p_entidade: string; p_id: string; p_mes: string };
        Returns: undefined;
      };
      fn_antecipar_adiantamentos_colaborador: {
        Args: { p_colaborador: string };
        Returns: Json;
      };
      fn_apagar_arquivo_orfao: {
        Args: { p_arquivo_id: string; p_carencia_horas?: number };
        Returns: boolean;
      };
      fn_aplicar_regra_pagamento: {
        Args: { p_lanc_id: string };
        Returns: undefined;
      };
      fn_aprovar_folha: { Args: { p_folha: string }; Returns: undefined };
      fn_aprovar_ordem_compra: {
        Args: { p_oc_id: string };
        Returns: undefined;
      };
      fn_aprovar_parcela: {
        Args: {
          p_conta_id?: string;
          p_data_programada?: string;
          p_parcela_id: string;
        };
        Returns: undefined;
      };
      fn_aprovar_ponto: { Args: { p_ponto: string }; Returns: undefined };
      fn_aprovar_rescisao: { Args: { p_rescisao: string }; Returns: undefined };
      fn_arquivo_por_hash: {
        Args: { p_hash: string; p_tamanho: number };
        Returns: string;
      };
      fn_arquivos_orfaos: {
        Args: { p_carencia_horas?: number };
        Returns: {
          id: string;
          orfao_em: string;
          path_storage: string;
        }[];
      };
      fn_atestados_ponto: {
        Args: { p_data: string };
        Returns: {
          colaborador_id: string;
        }[];
      };
      fn_binarios_sem_registro: {
        Args: { p_carencia_horas?: number };
        Returns: {
          criado_em: string;
          path_storage: string;
        }[];
      };
      fn_cancelar_ordem_compra: {
        Args: { p_motivo: string; p_oc_id: string };
        Returns: undefined;
      };
      fn_categoria_do_rh: {
        Args: { p_colaborador: string; p_evento: string };
        Returns: string;
      };
      fn_centro_custo_bloqueio: { Args: { p_id: string }; Returns: string };
      fn_centro_custo_dependencias: { Args: { p_id: string }; Returns: Json };
      fn_centro_custo_subarvore: {
        Args: { p_centro: string };
        Returns: {
          id: string;
        }[];
      };
      fn_centros_custo_bloqueios: {
        Args: { p_ids?: string[] };
        Returns: {
          bloqueio: string;
          centro_custo_id: string;
        }[];
      };
      fn_chave_nome: { Args: { p_texto: string }; Returns: string };
      fn_competencia_fechada: { Args: { p_mes: string }; Returns: boolean };
      fn_competencias_painel: {
        Args: { p_meses?: number };
        Returns: {
          custo: number;
          excecoes: number;
          fechada: boolean;
          fechado_em: string;
          fechado_por: string;
          incompletos: number;
          lancamentos: number;
          mes: string;
          observacao: string;
          reaberturas: number;
        }[];
      };
      fn_conciliar_transacao: {
        Args: { p_parcela_id: string; p_transacao_id: string };
        Returns: undefined;
      };
      fn_criar_forma_pagamento: {
        Args: { p_nome: string; p_tipo?: string };
        Returns: string;
      };
      fn_criar_ordem_compra: {
        Args: { p_cabecalho: Json; p_itens: Json };
        Returns: string;
      };
      fn_definir_conta_lancamento: {
        Args: { p_conta_id: string; p_lanc_id: string };
        Returns: undefined;
      };
      fn_definir_conta_lancamentos_lote: {
        Args: { p_conta_id: string; p_lanc_ids: string[] };
        Returns: Json;
      };
      fn_definir_parcelas_lancamento: {
        Args: { p_lanc_id: string; p_motivo?: string; p_parcelas: Json };
        Returns: undefined;
      };
      fn_definir_rateio_lancamento: {
        Args: { p_lanc_id: string; p_motivo: string; p_rateios: Json };
        Returns: undefined;
      };
      fn_definir_vencimento_folha: {
        Args: {
          p_data: string | null;
          p_folha: string;
        };
        Returns: undefined;
      };
      fn_desaprovar_folha: {
        Args: { p_folha: string; p_motivo: string };
        Returns: undefined;
      };
      fn_desaprovar_ordem_compra: {
        Args: { p_motivo: string; p_oc_id: string };
        Returns: undefined;
      };
      fn_desaprovar_parcela: {
        Args: { p_motivo: string; p_parcela_id: string };
        Returns: undefined;
      };
      fn_desaprovar_rescisao: {
        Args: { p_motivo: string; p_rescisao: string };
        Returns: undefined;
      };
      fn_desconciliar_transacao: {
        Args: { p_transacao_id: string };
        Returns: undefined;
      };
      fn_desvincular_arquivo: {
        Args: { p_vinculo_id: string };
        Returns: undefined;
      };
      fn_editar_item_folha: {
        Args: {
          p_centro_custo: string;
          p_desconto?: number;
          p_desconto_horas?: number;
          p_gratificacao: number;
          p_horas_extras: number;
          p_horas_normais: number;
          p_item: string;
          p_salario_base: number;
          p_valor_extras: number;
        };
        Returns: undefined;
      };
      fn_editar_item_rescisao: {
        Args: { p_item: string; p_valor: number };
        Returns: undefined;
      };
      fn_enviar_rescisao_aprovacao: {
        Args: { p_rescisao: string };
        Returns: undefined;
      };
      fn_epis_a_recolher: {
        Args: never;
        Returns: {
          ca: string;
          colaborador_id: string;
          colaborador_nome: string;
          data_entrega: string;
          descricao: string;
          id: string;
          quantidade: number;
        }[];
      };
      fn_estornar_pagamento: {
        Args: { p_parcela_id: string };
        Returns: undefined;
      };
      fn_excluir_adiantamento: { Args: { p_id: string }; Returns: undefined };
      fn_excluir_cadastro: {
        Args: { p_id: string; p_motivo: string; p_tabela: string };
        Returns: undefined;
      };
      fn_excluir_centro_custo: {
        Args: { p_id: string; p_motivo: string };
        Returns: undefined;
      };
      fn_excluir_cotacao: { Args: { p_id: string }; Returns: undefined };
      fn_excluir_lancamento: { Args: { p_id: string }; Returns: undefined };
      fn_excluir_obra: {
        Args: { p_id: string; p_motivo: string };
        Returns: undefined;
      };
      fn_excluir_ordem_compra: { Args: { p_id: string }; Returns: undefined };
      fn_excluir_rescisao: {
        Args: { p_motivo: string; p_rescisao: string };
        Returns: undefined;
      };
      fn_excluir_transferencia: {
        Args: { p_id: string; p_motivo: string };
        Returns: undefined;
      };
      fn_excluir_usuario: { Args: { p_id: string }; Returns: boolean };
      fn_exigir_competencia_aberta: {
        Args: { p_entidade: string; p_id: string; p_mes: string };
        Returns: undefined;
      };
      fn_extrato_conta: {
        Args: { p_conta: string; p_incluir_anteriores?: boolean };
        Returns: {
          chave: string;
          tipo_movimento: string;
          lancamento_id: string | null;
          data_movimento: string | null;
          sentido: string;
          // NUMERIC. O gerador escreve `number`, e nisto ele mente: o PostgREST
          // devolve NUMERIC como string em algumas rotas. Quem le converte.
          valor: number;
          no_saldo: boolean;
          numero: string | null;
          numero_documento: string | null;
          descricao: string | null;
          categoria_nome: string | null;
          contraparte: string | null;
          parcela: string | null;
        }[];
      };
      fn_fechar_competencia: {
        Args: { p_mes: string; p_observacao?: string };
        Returns: undefined;
      };
      fn_fechar_diarias: {
        Args: {
          p_colaborador: string;
          p_competencia: string;
          p_data_vencimento: string;
          p_forma_pagamento: string;
        };
        Returns: string;
      };
      fn_folha_aplicar_encargos_e_provisoes: {
        Args: { p_base: number; p_encargos_percentual: number; p_item: string };
        Returns: undefined;
      };
      fn_folha_avos_do_mes: {
        Args: { p_admissao: string; p_competencia: string; p_demissao: string };
        Returns: number;
      };
      fn_folha_inss: { Args: { p_base: number }; Returns: number };
      fn_folha_irrf: {
        Args: { p_base: number; p_colaborador: string; p_inss: number };
        Returns: number;
      };
      fn_folha_recalcular_totais: {
        Args: { p_folha: string };
        Returns: undefined;
      };
      fn_gerar_folha: {
        Args: { p_competencia: string; p_encargos_pct?: number };
        Returns: string;
      };
      fn_gerar_rescisao: {
        Args: {
          p_aviso: string;
          p_colaborador: string;
          p_data_aviso?: string;
          p_data_desligamento: string;
          p_data_vencimento?: string;
          p_ferias_vencidas_periodos?: number;
          p_observacao?: string;
          p_remuneracao_base?: number;
          p_saldo_fgts?: number;
          p_tipo: string;
        };
        Returns: string;
      };
      fn_impacto_reclassificar_insumos: {
        Args: { p_insumo_ids: string[] };
        Returns: {
          lancamentos: number;
          ordens: number;
          ordens_aprovadas: number;
          valor: number;
        }[];
      };
      fn_importar_br364_lote09: {
        Args: {
          p_ajustar_saldo_conta?: boolean;
          p_criar_lancamento_orfao?: boolean;
          p_usuario_id?: string;
        };
        Returns: Json;
      };
      fn_importar_extrato: {
        Args: {
          p_conta_id: string;
          p_nome: string;
          p_periodo_fim: string;
          p_periodo_inicio: string;
          p_transacoes: Json;
        };
        Returns: Json;
      };
      fn_importar_lancamentos: { Args: { p_linhas: Json }; Returns: Json };
      fn_janela_pagamento: { Args: never; Returns: string };
      fn_jornadas_ponto: {
        Args: never;
        Returns: {
          colaborador_id: string;
          horas_domingo: number;
          horas_quarta: number;
          horas_quinta: number;
          horas_sabado: number;
          horas_segunda: number;
          horas_sexta: number;
          horas_terca: number;
        }[];
      };
      fn_jsonb_lista: { Args: { p_valor: Json }; Returns: Json };
      fn_lancamentos_do_recorte: {
        Args: {
          p_conta?: string;
          p_faixa?: string;
          p_hoje?: string;
          p_mes?: string;
          p_realizado?: boolean;
          p_tipo_lancamento?: string;
          p_tipo_recorte: string;
        };
        Returns: {
          lancamento_id: string;
          valor_no_recorte: number;
        }[];
      };
      fn_limpar_preferencia_tabela: {
        Args: { p_tabela: string };
        Returns: undefined;
      };
      fn_limpar_senha_provisoria_propria: { Args: never; Returns: number };
      fn_listar_lancamentos: {
        Args: {
          p_descendente?: boolean;
          p_filtros?: Json;
          p_ordenar_por?: string;
          p_pagina?: number;
          p_tamanho?: number;
        };
        Returns: Json;
      };
      fn_marcar_parcela_conferida: {
        Args: { p_conferido?: boolean; p_parcela_id: string };
        Returns: undefined;
      };
      fn_obra_bloqueio: { Args: { p_id: string }; Returns: string };
      fn_obra_dependencias: { Args: { p_id: string }; Returns: Json };
      fn_obras_bloqueios: {
        Args: { p_ids?: string[] };
        Returns: {
          bloqueio: string;
          obra_id: string;
        }[];
      };
      fn_oc_categorias_derivadas: {
        Args: { p_oc_id: string };
        Returns: undefined;
      };
      fn_padrao_categoria_de_custo: {
        Args: never;
        Returns: {
          categoria_financeira_id: string;
          categoria_insumo_id: string;
        }[];
      };
      fn_pagar_parcela: {
        Args: {
          p_conta_id: string;
          p_data_pagamento: string;
          p_desconto?: number;
          p_juros?: number;
          p_motivo?: string;
          p_outras_despesas?: number;
          p_parcela_id: string;
        };
        Returns: undefined;
      };
      fn_parcelas_da_condicao: {
        Args: { p_condicao_id: string; p_data_base: string; p_valor: number };
        Returns: {
          data_vencimento: string;
          numero_parcela: number;
          valor: number;
        }[];
      };
      fn_pode_lancar_tipo: {
        Args: { p_acao: string; p_tipo: string };
        Returns: boolean;
      };
      fn_pode_ver_saldo: { Args: { p_conta: string }; Returns: boolean };
      fn_propagar_anexos: {
        Args: {
          p_de_id: string;
          p_de_tipo: string;
          p_para_id: string;
          p_para_tipo: string;
        };
        Returns: number;
      };
      fn_proxima_competencia_desconto: {
        Args: { p_apos: string };
        Returns: string;
      };
      fn_quitar_adiantamento: {
        Args: { p_adiantamento: string; p_competencia: string };
        Returns: undefined;
      };
      fn_rateios_da_linha: {
        Args: { p_centro_padrao: string; p_linha: Json; p_valor: number };
        Returns: Json;
      };
      fn_reabrir_competencia: {
        Args: { p_mes: string; p_motivo: string };
        Returns: undefined;
      };
      fn_reabrir_ponto: { Args: { p_ponto: string }; Returns: undefined };
      fn_realinhar_rateio_do_lancamento: {
        Args: { p_lancamento_id: string };
        Returns: undefined;
      };
      fn_recalcular_status_lancamento: {
        Args: { p_lanc_id: string };
        Returns: undefined;
      };
      fn_reclassificar_insumo: {
        Args: {
          // O gerador escreve `p_categoria_anterior_id?: string`, porque o
          // parâmetro tem DEFAULT e ele não sabe que NULL é um valor LEGÍTIMO
          // aqui: nulo significa "o insumo não tinha categoria", e é contra isso
          // que a função compara para recusar a troca quando outra pessoa
          // reclassificou o mesmo insumo. Com o tipo do gerador, passar null
          // deixa de compilar e a única saída seria mentir com `?? undefined`,
          // que apagaria a diferença entre "não tinha" e "não sei".
          p_categoria_anterior_id: string | null;
          p_categoria_id: string;
          p_insumo_id: string;
        };
        Returns: {
          lancamentos: number;
          ordens: number;
          ordens_aprovadas: number;
          valor: number;
        }[];
      };
      fn_recurso_da_entidade: { Args: { p_tipo: string }; Returns: string };
      fn_recurso_do_cadastro: { Args: { p_tabela: string }; Returns: string };
      fn_reenviar_parcela: {
        Args: { p_observacao?: string; p_parcela_id: string };
        Returns: undefined;
      };
      fn_registrar_adiantamento: { Args: { p_dados: Json }; Returns: string };
      fn_registrar_arquivo: {
        Args: {
          p_entidade_id: string;
          p_entidade_tipo: string;
          p_hash: string;
          p_mime: string;
          p_nome: string;
          p_path: string;
          p_tamanho: number;
        };
        Returns: string;
      };
      fn_registrar_recebimento: {
        Args: {
          p_data_recebimento: string;
          p_numero_nf: string;
          p_oc_id: string;
          p_valor_nf: number;
        };
        Returns: undefined;
      };
      fn_rejeitar_rescisao: {
        Args: { p_motivo: string; p_rescisao: string };
        Returns: undefined;
      };
      fn_rel_aging: {
        Args: { p_hoje?: string };
        Returns: {
          faixa_aging: string;
          faixa_prazo: string;
          tipo: string;
          total: number;
        }[];
      };
      fn_rel_creditos: {
        Args: never;
        Returns: {
          categoria: string;
          credor: string;
          descricao: string;
          lancamento_id: string;
          numero: string;
          parcelas: number;
          parcelas_pagas: number;
          proximo_vencimento: string;
          saldo_devedor: number;
          total_pago: number;
          valor_contratado: number;
        }[];
      };
      fn_rel_creditos_por_mes: {
        Args: { p_meses?: number };
        Returns: {
          mes: string;
          parcelas: number;
          valor: number;
        }[];
      };
      fn_rel_custo_centro_custo: {
        Args: {
          p_categorias?: string[];
          p_centros?: string[];
          p_excluir_previsto?: boolean;
          p_fim?: string;
          p_formas?: string[];
          p_fornecedores?: string[];
          p_inicio?: string;
          p_sem_forma?: boolean;
          p_status?: string[];
          p_tipos_centro?: string[];
        };
        Returns: {
          centro_custo_id: string;
          codigo: string;
          nome: string;
          total: number;
        }[];
      };
      fn_rel_custo_centro_serie: {
        Args: {
          p_categorias?: string[];
          p_centros: string[];
          p_excluir_previsto?: boolean;
          p_fim?: string;
          p_formas?: string[];
          p_fornecedores?: string[];
          p_inicio?: string;
          p_sem_forma?: boolean;
          p_status?: string[];
          p_tipos_centro?: string[];
        };
        Returns: {
          centro_custo_id: string;
          codigo: string;
          mes: string;
          nome: string;
          total: number;
        }[];
      };
      fn_rel_custo_centro_vida: {
        Args: { p_centros: string[] };
        Returns: {
          centro_custo_id: string;
          primeiro_mes: string;
        }[];
      };
      fn_rel_custo_itens_oc: {
        Args: { p_fim?: string; p_inicio?: string };
        Returns: {
          categoria_financeira_id: string;
          categoria_insumo_id: string;
          centro_custo_id: string;
          grupo_id: string;
          insumo_id: string;
          item_id: string;
          lancamento_id: string;
          quantidade: number;
          valor: number;
        }[];
      };
      fn_rel_custo_por_grupo: {
        Args: {
          p_categoria?: string;
          p_centro_custo?: string;
          p_fim?: string;
          p_inicio?: string;
        };
        Returns: {
          grupo_cor: string;
          grupo_id: string;
          grupo_nome: string;
          grupo_ordem: number;
          total: number;
        }[];
      };
      fn_rel_custo_por_insumo: {
        Args: {
          p_categoria_id: string;
          p_centro_custo?: string;
          p_fim?: string;
          p_inicio?: string;
        };
        Returns: {
          insumo_id: string;
          insumo_nome: string;
          quantidade: number;
          total: number;
        }[];
      };
      fn_rel_custo_por_mes: {
        Args: {
          p_categoria?: string;
          p_centro_custo?: string;
          p_fim?: string;
          p_inicio?: string;
          p_meses?: number;
        };
        Returns: {
          lancamentos: number;
          mes: string;
          total: number;
        }[];
      };
      fn_rel_custo_por_subcategoria: {
        Args: {
          p_centro_custo?: string;
          p_fim?: string;
          p_grupo_id: string;
          p_inicio?: string;
        };
        Returns: {
          categoria_id: string;
          categoria_nome: string;
          total: number;
        }[];
      };
      fn_rel_custo_receita: {
        Args: {
          p_centros_custo?: string[];
          p_centros_receita?: string[];
          p_meses: string[];
        };
        Returns: {
          centro_custo_id: string;
          codigo: string;
          mes: string;
          nome: string;
          retencao: number;
          tipo: string;
          total: number;
        }[];
      };
      fn_rel_dre: {
        Args: { p_fim: string; p_inicio: string };
        Returns: {
          categoria: string;
          categoria_id: string;
          natureza: string;
          tipo: string;
          total: number;
        }[];
      };
      fn_rel_emprestimos_por_contrato: {
        Args: never;
        Returns: {
          a_pagar: number;
          centro_custo_id: string;
          contrato: string;
          pago: number;
          parcelas: number;
          parcelas_pagas: number;
          proximo_vencimento: string;
          tomado: number;
        }[];
      };
      fn_rel_fluxo_caixa: {
        Args: {
          p_centros_custo?: string[];
          p_centros_receita?: string[];
        };
        Returns: {
          mes: string;
          realizado: boolean;
          tipo: string;
          total: number;
        }[];
      };
      fn_rel_fornecedores_com_lancamentos: {
        Args: never;
        Returns: {
          id: string;
          nome: string;
        }[];
      };
      fn_rel_gestao_compras_resumo: {
        Args: never;
        Returns: {
          cotacoes_abertas: number;
          ocs_abertas_contagem: number;
          ocs_abertas_valor: number;
          ocs_aprovar_contagem: number;
          ocs_aprovar_valor: number;
        }[];
      };
      fn_rel_gestao_financeiro_resumo: {
        Args: { p_hoje?: string };
        Returns: {
          a_aprovar_contagem: number;
          a_aprovar_valor: number;
          a_pagar_contagem: number;
          a_pagar_valor: number;
          a_pagar_vencidas: number;
          pago_mes_contagem: number;
          pago_mes_valor: number;
        }[];
      };
      fn_rel_meses_competencia: {
        Args: never;
        Returns: {
          mes: string;
        }[];
      };
      fn_rel_movimento_antes_do_corte: {
        Args: never;
        Returns: {
          conta_bancaria_id: string;
          corte: string;
          pago: number;
          parcelas: number;
          recebido: number;
        }[];
      };
      fn_rel_posicao_aplicacao: {
        Args: never;
        Returns: {
          aplicado: number;
          conta_bancaria_id: string;
          posicao: number;
          resgatado: number;
        }[];
      };
      fn_rel_posicao_bancaria: {
        Args: never;
        Returns: {
          conta_bancaria_id: string;
          tipo: string;
          total: number;
        }[];
      };
      fn_remover_item_rescisao: {
        Args: { p_item: string };
        Returns: undefined;
      };
      fn_remover_minha_foto: { Args: never; Returns: string };
      fn_reprogramar_parcela: {
        Args: {
          p_data_programada: string;
          p_motivo: string;
          p_parcela_id: string;
        };
        Returns: undefined;
      };
      fn_rescisao_avos_13: {
        Args: { p_admissao: string; p_data_fim: string };
        Returns: number;
      };
      fn_rescisao_avos_ferias: {
        Args: { p_admissao: string; p_data_fim: string };
        Returns: number;
      };
      fn_rescisao_gravar_item: {
        Args: {
          p_calculado: number;
          p_codigo: string;
          p_descricao: string;
          p_manuais: Json;
          p_natureza: string;
          p_ordem: number;
          p_referencia: string;
          p_rescisao: string;
        };
        Returns: undefined;
      };
      fn_rescisao_periodos_vencidos: {
        Args: { p_colaborador: string; p_data_fim: string };
        Returns: number;
      };
      fn_rescisao_recalcular_totais: {
        Args: { p_rescisao: string };
        Returns: undefined;
      };
      fn_restaurar_cadastro: {
        Args: { p_lixeira_id: string };
        Returns: undefined;
      };
      fn_revisar_parcela: {
        Args: { p_motivo: string; p_parcela_id: string };
        Returns: undefined;
      };
      fn_saldo_conta: { Args: { p_conta: string }; Returns: number };
      fn_saldos_das_contas: {
        Args: never;
        Returns: {
          anterior_pago: number;
          anterior_parcelas: number;
          anterior_recebido: number;
          aplicado: number;
          conta_bancaria_id: string;
          entradas: number;
          posicao_aplicacao: number;
          resgatado: number;
          saidas: number;
          saldo: number;
          saldo_inicial: number;
          saldo_inicial_data: string;
        }[];
      };
      fn_salvar_cartao_credito: {
        Args: {
          p_ativo: boolean;
          p_banco: string;
          p_bandeira: string;
          p_dia_fechamento: number;
          p_dia_vencimento: number;
          p_id: string;
          p_nome: string;
          p_ultimos_digitos: string;
        };
        Returns: string;
      };
      fn_salvar_forma_pagamento: {
        Args: {
          p_ativo: boolean;
          p_id: string;
          p_nome: string;
          p_tipo: string;
        };
        Returns: string;
      };
      fn_salvar_lancamento: {
        Args: {
          p_dados: Json;
          p_formas?: Json;
          p_id: string;
          p_parcelas: Json;
          p_rateios: Json;
        };
        Returns: string;
      };
      fn_salvar_meu_perfil: {
        // Todos `string | null` À MÃO: os parâmetros não têm DEFAULT no banco, e
        // o gerador escreve `string` para parâmetro sem DEFAULT — ele não sabe
        // que a coluna aceita null. Aqui null é o valor normal (campo em
        // branco), e a action manda as treze chaves sempre.
        Args: {
          p_cargo: string | null;
          p_celular: string | null;
          p_cpf: string | null;
          p_data_nascimento: string | null;
          p_endereco_bairro: string | null;
          p_endereco_cep: string | null;
          p_endereco_cidade: string | null;
          p_endereco_complemento: string | null;
          p_endereco_logradouro: string | null;
          p_endereco_numero: string | null;
          p_endereco_uf: string | null;
          p_ramal: string | null;
          p_rg: string | null;
        };
        Returns: undefined;
      };
      fn_salvar_minha_foto: { Args: never; Returns: string };
      fn_salvar_parcelas_oc: {
        Args: { p_formas?: Json; p_oc_id: string; p_parcelas: Json };
        Returns: undefined;
      };
      fn_salvar_preferencia_tabela: {
        Args: { p_preferencia: Json; p_tabela: string };
        Returns: undefined;
      };
      fn_salvar_transferencia: {
        Args: {
          p_conta_destino_id: string;
          p_conta_origem_id: string;
          p_data: string;
          p_descricao?: string;
          // Null cria uma transferencia nova; preenchido edita a existente. O
          // parametro nao pode ter DEFAULT no Postgres porque vem antes de
          // parametros obrigatorios, entao quem cria manda null explicito.
          //
          // Escrito a mao de proposito: o gerador de tipos nao sabe que a funcao
          // aceita null num parametro sem DEFAULT, e escreve `string`. Regerar
          // este arquivo apaga esta linha -- ja aconteceu em 25/08, 26/08 e
          // 29/08/2026.
          p_id: string | null;
          p_observacoes?: string;
          p_tarifa?: number;
          p_valor: number;
        };
        Returns: string;
      };
      fn_tirar_da_folha: {
        // `p_motivo` opcional no banco (default null). Os dois ids são
        // obrigatórios: não existe "tirar alguém" sem dizer de qual folha.
        Args: {
          p_colaborador_id: string;
          p_folha_id: string;
          p_motivo?: string | null;
        };
        Returns: undefined;
      };
      fn_total_da_oc: {
        Args: {
          p_desconto: number;
          p_frete: number;
          p_impostos: number;
          p_oc: string;
          p_outras: number;
        };
        Returns: number;
      };
      fn_vencimento_folha: {
        Args: { p_competencia: string; p_dia: number };
        Returns: string;
      };
      fn_verificar_diagnosticos_gravados: {
        Args: never;
        Returns: {
          consulta: string;
          erro: string;
          objeto: string;
          ordem: number;
        }[];
      };
      fn_vincular_arquivo: {
        Args: {
          p_arquivo_id: string;
          p_entidade_id: string;
          p_entidade_tipo: string;
          p_nome_exibicao?: string;
        };
        Returns: string;
      };
      fn_voltar_para_folha: {
        Args: { p_colaborador_id: string; p_folha_id: string };
        Returns: undefined;
      };
      nomes_usuarios_auditoria: {
        Args: { p_ids: string[] };
        Returns: {
          id: string;
          nome: string;
        }[];
      };
      nomes_usuarios_compras: {
        Args: { p_ids: string[] };
        Returns: {
          id: string;
          nome: string;
        }[];
      };
      nomes_usuarios_financeiro: {
        Args: { p_ids: string[] };
        Returns: {
          id: string;
          nome: string;
        }[];
      };
      proximo_numero_documento: { Args: { p_tipo: string }; Returns: string };
      salvar_condicao: {
        Args: {
          p_ativo: boolean;
          p_descricao: string;
          p_id: string;
          p_parcelas: Json;
        };
        Returns: string;
      };
      salvar_condicao_parcelas: {
        Args: { p_condicao_id: string; p_parcelas: Json };
        Returns: undefined;
      };
      salvar_matriz_usuario: {
        Args: { p_permissoes: Json; p_usuario_id: string };
        Returns: undefined;
      };
      salvar_permissoes_perfil: {
        Args: { p_perfil_id: string; p_permissoes: Json };
        Returns: undefined;
      };
      salvar_saldos_usuario: {
        Args: { p_contas: string[]; p_usuario_id: string };
        Returns: undefined;
      };
      tabelas_auditadas: { Args: never; Returns: string[] };
      tem_permissao: {
        Args: { p_acao: string; p_recurso: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
