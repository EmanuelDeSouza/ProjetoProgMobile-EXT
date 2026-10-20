CREATE TABLE "alertas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residencia_id" uuid NOT NULL,
	"regra_id" uuid,
	"dispositivo_id" uuid,
	"severidade" text NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"reconhecido_por" uuid,
	"reconhecido_em" timestamp with time zone,
	"nota" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residencia_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residencia_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"comodo" text NOT NULL,
	"device_key" text NOT NULL,
	"estado_atual" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"ultimo_contato_em" timestamp with time zone,
	"codigo_pareamento" text,
	"codigo_pareamento_expira_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispositivos_device_key_unique" UNIQUE("device_key")
);
--> statement-breakpoint
CREATE TABLE "eventos_dispositivo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispositivo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"valor" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residencia_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"pin_hash" text NOT NULL,
	"tentativas_erradas" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"alvo_id" uuid NOT NULL,
	"lida_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regras_alerta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residencia_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"condicao" text NOT NULL,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residencia_membros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residencia_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"papel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "residencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"endereco_curto" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sos_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"residencia_id" uuid NOT NULL,
	"morador_id" uuid,
	"origem" text NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_residencia_id_residencias_id_fk" FOREIGN KEY ("residencia_id") REFERENCES "public"."residencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_regra_id_regras_alerta_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."regras_alerta"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_reconhecido_por_usuarios_id_fk" FOREIGN KEY ("reconhecido_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_residencia_id_residencias_id_fk" FOREIGN KEY ("residencia_id") REFERENCES "public"."residencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_residencia_id_residencias_id_fk" FOREIGN KEY ("residencia_id") REFERENCES "public"."residencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_dispositivo" ADD CONSTRAINT "eventos_dispositivo_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moradores" ADD CONSTRAINT "moradores_residencia_id_residencias_id_fk" FOREIGN KEY ("residencia_id") REFERENCES "public"."residencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_alerta" ADD CONSTRAINT "regras_alerta_residencia_id_residencias_id_fk" FOREIGN KEY ("residencia_id") REFERENCES "public"."residencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regras_alerta" ADD CONSTRAINT "regras_alerta_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residencia_membros" ADD CONSTRAINT "residencia_membros_residencia_id_residencias_id_fk" FOREIGN KEY ("residencia_id") REFERENCES "public"."residencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residencia_membros" ADD CONSTRAINT "residencia_membros_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_eventos" ADD CONSTRAINT "sos_eventos_residencia_id_residencias_id_fk" FOREIGN KEY ("residencia_id") REFERENCES "public"."residencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_eventos" ADD CONSTRAINT "sos_eventos_morador_id_moradores_id_fk" FOREIGN KEY ("morador_id") REFERENCES "public"."moradores"("id") ON DELETE set null ON UPDATE no action;