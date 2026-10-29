CREATE TABLE "pareamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"tipo" text NOT NULL,
	"chave" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"conflito" boolean DEFAULT false NOT NULL,
	"dispositivo_id" uuid,
	"usado_em" timestamp with time zone,
	"confirmado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moradores" ADD COLUMN "primeira_tentativa_errada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "residencia_id" uuid;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "titulo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notificacoes" ADD COLUMN "mensagem" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sos_eventos" ADD COLUMN "dispositivo_id" uuid;--> statement-breakpoint
ALTER TABLE "sos_eventos" ADD COLUMN "reconhecido_por" uuid;--> statement-breakpoint
ALTER TABLE "sos_eventos" ADD COLUMN "reconhecido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pareamentos" ADD CONSTRAINT "pareamentos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pareamentos_codigo_idx" ON "pareamentos" USING btree ("codigo");--> statement-breakpoint
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_residencia_id_residencias_id_fk" FOREIGN KEY ("residencia_id") REFERENCES "public"."residencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_eventos" ADD CONSTRAINT "sos_eventos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_eventos" ADD CONSTRAINT "sos_eventos_reconhecido_por_usuarios_id_fk" FOREIGN KEY ("reconhecido_por") REFERENCES "public"."usuarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_residencia_created_idx" ON "alertas" USING btree ("residencia_id","created_at");--> statement-breakpoint
CREATE INDEX "eventos_dispositivo_disp_created_idx" ON "eventos_dispositivo" USING btree ("dispositivo_id","created_at");--> statement-breakpoint
CREATE INDEX "notificacoes_usuario_created_idx" ON "notificacoes" USING btree ("usuario_id","created_at");--> statement-breakpoint
CREATE INDEX "regras_alerta_dispositivo_idx" ON "regras_alerta" USING btree ("dispositivo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "residencia_membros_residencia_usuario_uq" ON "residencia_membros" USING btree ("residencia_id","usuario_id");--> statement-breakpoint
CREATE INDEX "sos_eventos_residencia_created_idx" ON "sos_eventos" USING btree ("residencia_id","created_at");--> statement-breakpoint
ALTER TABLE "dispositivos" DROP COLUMN "codigo_pareamento";--> statement-breakpoint
ALTER TABLE "dispositivos" DROP COLUMN "codigo_pareamento_expira_em";