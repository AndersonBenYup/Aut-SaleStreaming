CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"customer_id" uuid,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bot_paused_until" timestamp with time zone,
	"handoff_reason" text,
	"last_order_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"item_key" text NOT NULL,
	"list_price" numeric(10, 2) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"round" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "sales_agent_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "store_api_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "store_bot_key_enc" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "sales_tone_guide" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "sales_max_discount_rounds" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_offers" ADD CONSTRAINT "sales_offers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_offers" ADD CONSTRAINT "sales_offers_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_threads_tenant_phone_idx" ON "chat_threads" USING btree ("tenant_id","phone","last_message_at");--> statement-breakpoint
CREATE INDEX "sales_offers_thread_idx" ON "sales_offers" USING btree ("thread_id","item_key");