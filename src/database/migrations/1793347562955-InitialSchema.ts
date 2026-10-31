import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793347562955 implements MigrationInterface {
  name = 'InitialSchema1793347562955';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "construction_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "code" character varying(40) NOT NULL, "name" character varying(120) NOT NULL, "color" character varying(9) NOT NULL, "icon" character varying(40), "sort_order" smallint NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_2872539172291631650d107cc81" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_887999e745306ea14046446d4d" ON "construction_types" ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "contractors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(200) NOT NULL, "inn" character varying(20) NOT NULL, "director" character varying(150), "phone" character varying(30), "email" character varying(150), "address" character varying(300), "license_number" character varying(60), "license_expiry" date, "rating" numeric(3,2) NOT NULL DEFAULT '0', "status" character varying(20) NOT NULL DEFAULT 'active', "founded_year" smallint, "employees_count" integer, "logo_url" character varying(500), "note" text, CONSTRAINT "PK_6dbfde8813cdc4c4689f1e1e503" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_246e635c8a3c058e684f5f0b99" ON "contractors" ("name") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b3bdf613cab8dbfe479332b7ff" ON "contractors" ("inn") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7c9dfb6c4b2710c8a2671dab59" ON "contractors" ("status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(200) NOT NULL, "type" character varying(80), "inn" character varying(20), "head" character varying(150), "phone" character varying(30), "address" character varying(300), "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b942d55b92ededa770041db9de" ON "customers" ("name") `,
    );
    await queryRunner.query(
      `CREATE TABLE "regions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "code" character varying(40) NOT NULL, "name" character varying(120) NOT NULL, "soato" character varying(20), "center_lat" double precision NOT NULL, "center_lng" double precision NOT NULL, "default_zoom" smallint NOT NULL DEFAULT '9', "bbox" jsonb, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_4fcd12ed6a046276e2deb08801c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4f6dc5a464961e7c65a395ea4c" ON "regions" ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "districts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "code" character varying(40) NOT NULL, "name" character varying(120) NOT NULL, "short_name" character varying(60) NOT NULL, "soato" character varying(20), "kind" character varying(20) NOT NULL DEFAULT 'district', "center_lat" double precision NOT NULL, "center_lng" double precision NOT NULL, "geometry" jsonb, "population" integer, "area_km2" double precision, "is_active" boolean NOT NULL DEFAULT true, "region_id" uuid NOT NULL, CONSTRAINT "uq_districts_region_code" UNIQUE ("region_id", "code"), CONSTRAINT "PK_972a72ff4e3bea5c7f43a2b98af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8e9d73424149b43b38244f7552" ON "districts" ("code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4271e8e205bbdce31975c55ed3" ON "districts" ("region_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "email" character varying(150) NOT NULL, "password_hash" character varying(120) NOT NULL, "first_name" character varying(60) NOT NULL, "last_name" character varying(60) NOT NULL, "middle_name" character varying(60), "position" character varying(120), "phone" character varying(30), "avatar_url" character varying(500), "role" character varying(30) NOT NULL DEFAULT 'viewer', "is_active" boolean NOT NULL DEFAULT true, "last_login_at" TIMESTAMP WITH TIME ZONE, "region_id" uuid, "district_id" uuid, "contractor_id" uuid, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ace513fa30d485cfd25c11a9e4" ON "users" ("role") `,
    );
    await queryRunner.query(
      `CREATE TABLE "object_delays" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "object_id" uuid NOT NULL, "reason_id" uuid NOT NULL, "delay_days" integer NOT NULL DEFAULT '0', "severity" character varying(20) NOT NULL DEFAULT 'medium', "status" character varying(20) NOT NULL DEFAULT 'open', "description" text, "mitigation_plan" text, "detected_at" date NOT NULL, "resolved_at" date, "responsible_id" uuid, CONSTRAINT "PK_c33edba39f27800c57186631846" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_311a158b245170bf8eefe24c9c" ON "object_delays" ("object_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2f345527fc2905089e17947035" ON "object_delays" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delays_reason_status" ON "object_delays" ("reason_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delays_object_status" ON "object_delays" ("object_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "delay_reasons" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "code" character varying(40) NOT NULL, "name" character varying(150) NOT NULL, "color" character varying(9) NOT NULL, "icon" character varying(40), "sort_order" smallint NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_76a15e93311799a965d4e7cb688" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b138fda2a2f2f7836a5198b163" ON "delay_reasons" ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "funding_sources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "code" character varying(40) NOT NULL, "name" character varying(120) NOT NULL, "color" character varying(9) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_6e23f297c64fa46177b5f7e9533" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_437dffe25174bbf50aff6b6172" ON "funding_sources" ("code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "files" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "original_name" character varying(300) NOT NULL, "stored_name" character varying(200) NOT NULL, "mime_type" character varying(120) NOT NULL, "size" bigint NOT NULL, "path" character varying(500) NOT NULL, "url" character varying(500) NOT NULL, "uploaded_by_id" uuid, CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b25b4b9c85b6e6ffa2789dc5da" ON "files" ("uploaded_by_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "object_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "object_id" uuid, "type" character varying(30) NOT NULL DEFAULT 'other', "title" character varying(300) NOT NULL, "number" character varying(80), "issued_date" date, "expiry_date" date, "file_id" uuid, "url" character varying(500), "uploaded_by_id" uuid, "note" text, CONSTRAINT "PK_42dc8e860f28bbe0e3be288252b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fe9e3860b565ed004794fba6f0" ON "object_documents" ("object_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_documents_object_type" ON "object_documents" ("object_id", "type") `,
    );
    await queryRunner.query(
      `CREATE TABLE "object_milestones" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "object_id" uuid NOT NULL, "name" character varying(200) NOT NULL, "description" text, "planned_start" date NOT NULL, "planned_end" date NOT NULL, "actual_start" date, "actual_end" date, "progress_percent" numeric(5,2) NOT NULL DEFAULT '0', "weight" numeric(5,2) NOT NULL DEFAULT '0', "status" character varying(20) NOT NULL DEFAULT 'planned', "sort_order" smallint NOT NULL DEFAULT '0', CONSTRAINT "PK_b2a9dfd013f58bc46f28b31f0a6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c82c8ec2371f4e0675c9704def" ON "object_milestones" ("object_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9f650d2ef222bb23ba35134958" ON "object_milestones" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_milestones_planned_end" ON "object_milestones" ("planned_end") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_milestones_object_order" ON "object_milestones" ("object_id", "sort_order") `,
    );
    await queryRunner.query(
      `CREATE TABLE "object_progress_updates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "object_id" uuid NOT NULL, "report_date" date NOT NULL, "progress_percent" numeric(5,2) NOT NULL, "previous_percent" numeric(5,2) NOT NULL DEFAULT '0', "note" text, "source" character varying(20) NOT NULL DEFAULT 'manual', "author_id" uuid, CONSTRAINT "PK_106abe6da03fa5e869fed5a02b2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2822d50cbe93f1e439fd740ec0" ON "object_progress_updates" ("object_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_progress_object_date" ON "object_progress_updates" ("object_id", "report_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "photo_report_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "report_id" uuid NOT NULL, "file_id" uuid NOT NULL, "url" character varying(500) NOT NULL, "caption" character varying(300), "sort_order" smallint NOT NULL DEFAULT '0', CONSTRAINT "PK_a2cfa09978968f6f4b3977ff407" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_photo_images_report_order" ON "photo_report_images" ("report_id", "sort_order") `,
    );
    await queryRunner.query(
      `CREATE TABLE "photo_reports" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "object_id" uuid NOT NULL, "captured_at" TIMESTAMP WITH TIME ZONE NOT NULL, "lat" double precision, "lng" double precision, "progress_percent" numeric(5,2) NOT NULL DEFAULT '0', "note" text, "status" character varying(20) NOT NULL DEFAULT 'pending', "ai_verdict" character varying(20) NOT NULL DEFAULT 'pending', "ai_confidence" numeric(4,3), "ai_comment" text, "ai_checked_at" TIMESTAMP WITH TIME ZONE, "author_id" uuid, "reviewed_by_id" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "reject_reason" text, CONSTRAINT "PK_7d37c17607a3c1d7312443a996e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_91a599d3417c10b95320d65e08" ON "photo_reports" ("object_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_346fcf9e7b967968fe8e75ae46" ON "photo_reports" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e9522c9fe01981bac1739a472b" ON "photo_reports" ("ai_verdict") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_photo_reports_object_date" ON "photo_reports" ("object_id", "captured_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "construction_objects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "code" character varying(30) NOT NULL, "name" character varying(300) NOT NULL, "description" text, "address" character varying(400), "lat" double precision, "lng" double precision, "district_id" uuid NOT NULL, "region_id" uuid NOT NULL, "type_id" uuid NOT NULL, "customer_id" uuid, "contractor_id" uuid, "responsible_id" uuid, "total_cost" numeric(18,2) NOT NULL DEFAULT '0', "funded_amount" numeric(18,2) NOT NULL DEFAULT '0', "paid_amount" numeric(18,2) NOT NULL DEFAULT '0', "funding_source_id" uuid, "capacity" integer, "capacity_unit" character varying(60), "area_m2" double precision, "floors" smallint, "planned_start_date" date NOT NULL, "planned_end_date" date NOT NULL, "actual_start_date" date, "actual_end_date" date, "status" character varying(20) NOT NULL DEFAULT 'not_started', "progress_percent" numeric(5,2) NOT NULL DEFAULT '0', "health_status" character varying(20) NOT NULL DEFAULT 'not_started', "delay_days" integer NOT NULL DEFAULT '0', "expected_progress" numeric(5,2) NOT NULL DEFAULT '0', "progress_gap" numeric(6,2) NOT NULL DEFAULT '0', "risk_level" character varying(20) NOT NULL DEFAULT 'low', "risk_score" smallint NOT NULL DEFAULT '0', "health_calculated_at" TIMESTAMP WITH TIME ZONE, "primary_delay_reason_id" uuid, "open_delay_count" smallint NOT NULL DEFAULT '0', "last_report_at" TIMESTAMP WITH TIME ZONE, "cover_image_url" character varying(500), CONSTRAINT "PK_7bc9ab77cbf2fa29aa9cd0e90f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_06be83d4325c05a3efc9496d3f" ON "construction_objects" ("code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_23933f00b86a124c23e206b011" ON "construction_objects" ("name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8025194108df75d86b0ce89a7a" ON "construction_objects" ("district_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dffb98c7ea8dc3e6135b9eb80d" ON "construction_objects" ("region_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2101b922daa83647a0984fef64" ON "construction_objects" ("type_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b35ab59372a3dfb27b84c04cc9" ON "construction_objects" ("contractor_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bb489287a1eef353c9b09290c4" ON "construction_objects" ("responsible_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_83f79f61456dc3809165c14a53" ON "construction_objects" ("health_status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8abfb947dcf75cdfa620867be9" ON "construction_objects" ("risk_level") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_objects_status" ON "construction_objects" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_objects_planned_end" ON "construction_objects" ("planned_end_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_objects_type_health" ON "construction_objects" ("type_id", "health_status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_objects_district_health" ON "construction_objects" ("district_id", "health_status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_objects_region_health" ON "construction_objects" ("region_id", "health_status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ai_analyses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "object_id" uuid NOT NULL, "type" character varying(40) NOT NULL, "score" numeric(5,2) NOT NULL DEFAULT '0', "risk_level" character varying(20) NOT NULL DEFAULT 'low', "summary" text NOT NULL, "recommendations" jsonb, "details" jsonb, "model" character varying(60) NOT NULL DEFAULT 'rule-engine-v1', CONSTRAINT "PK_f668f96ca6b8cd3dd8ebbd5c576" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c977fd742350c7fd323af5a011" ON "ai_analyses" ("object_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ai_object_type_date" ON "ai_analyses" ("object_id", "type", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "app_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "key" character varying(100) NOT NULL, "value" jsonb NOT NULL, "description" character varying(300), "category" character varying(40) NOT NULL DEFAULT 'general', CONSTRAINT "PK_4800b266ba790931744b3e53a74" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_975c2db59c65c05fd9c6b63a2a" ON "app_settings" ("key") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ba86ef231f5dcbb7b099771cb0" ON "app_settings" ("category") `,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" uuid, "action" character varying(60) NOT NULL, "entity" character varying(60) NOT NULL, "entity_id" uuid, "changes" jsonb, "ip_address" character varying(60), "user_agent" character varying(300), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_user_date" ON "audit_logs" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_entity" ON "audit_logs" ("entity", "entity_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "funding_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "object_id" uuid NOT NULL, "allocation_id" uuid, "type" character varying(20) NOT NULL, "amount" numeric(18,2) NOT NULL, "occurred_at" date NOT NULL, "document_number" character varying(80), "note" text, "created_by_id" uuid, CONSTRAINT "PK_369a4c0fd0d1a7b14ebd9fa8e1c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a74e4e18bef1bf3b2a1cac036a" ON "funding_transactions" ("object_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_01432af76fdcb80e51500bfb66" ON "funding_transactions" ("type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_funding_tx_object_date" ON "funding_transactions" ("object_id", "occurred_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "funding_allocations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "object_id" uuid NOT NULL, "source_id" uuid NOT NULL, "year" smallint NOT NULL, "planned_amount" numeric(18,2) NOT NULL DEFAULT '0', "allocated_amount" numeric(18,2) NOT NULL DEFAULT '0', "paid_amount" numeric(18,2) NOT NULL DEFAULT '0', "note" text, CONSTRAINT "uq_allocation_object_source_year" UNIQUE ("object_id", "source_id", "year"), CONSTRAINT "PK_f79748e84da021cfd4f65ea5b2e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3802cc8b4fe418dea27b172f68" ON "funding_allocations" ("object_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_allocations_year" ON "funding_allocations" ("year") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" uuid, "type" character varying(40) NOT NULL, "severity" character varying(20) NOT NULL DEFAULT 'info', "title" character varying(200) NOT NULL, "body" text NOT NULL, "object_id" uuid, "is_read" boolean NOT NULL DEFAULT false, "read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9a8a82462cab47c73d25f49261" ON "notifications" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_user_read" ON "notifications" ("user_id", "is_read", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, "token_hash" character varying(64) NOT NULL, "user_id" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "user_agent" character varying(300), "ip_address" character varying(60), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens" ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "districts" ADD CONSTRAINT "FK_4271e8e205bbdce31975c55ed3f" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_1901e9aae03c8897b7dd460c27f" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_efc03fc2a5902ef17fb8a2bdcc2" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_6bf4734eb05d2a3d74fa3186f37" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_delays" ADD CONSTRAINT "FK_311a158b245170bf8eefe24c9cb" FOREIGN KEY ("object_id") REFERENCES "construction_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_delays" ADD CONSTRAINT "FK_091a4ef0e69d2f7e0bdc9cd968b" FOREIGN KEY ("reason_id") REFERENCES "delay_reasons"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_delays" ADD CONSTRAINT "FK_8a691fc7383ecfd23e84516c5e0" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "files" ADD CONSTRAINT "FK_b25b4b9c85b6e6ffa2789dc5da5" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_documents" ADD CONSTRAINT "FK_fe9e3860b565ed004794fba6f0c" FOREIGN KEY ("object_id") REFERENCES "construction_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_documents" ADD CONSTRAINT "FK_27e8d48788535a6e0d1d6e5bfe2" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_documents" ADD CONSTRAINT "FK_e887eeecc6764aca69250e37f3d" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_milestones" ADD CONSTRAINT "FK_c82c8ec2371f4e0675c9704def8" FOREIGN KEY ("object_id") REFERENCES "construction_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_progress_updates" ADD CONSTRAINT "FK_2822d50cbe93f1e439fd740ec0d" FOREIGN KEY ("object_id") REFERENCES "construction_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_progress_updates" ADD CONSTRAINT "FK_e4b68ec51d49dc3bdb91cce09cc" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_report_images" ADD CONSTRAINT "FK_c44bd6744efc5a778892c61e67c" FOREIGN KEY ("report_id") REFERENCES "photo_reports"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_report_images" ADD CONSTRAINT "FK_bfe916788f9f9d20ee15eae8be7" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_reports" ADD CONSTRAINT "FK_91a599d3417c10b95320d65e08c" FOREIGN KEY ("object_id") REFERENCES "construction_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_reports" ADD CONSTRAINT "FK_f79129e7a2f89082aca2b71dd14" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_reports" ADD CONSTRAINT "FK_7bb81e744dbb5ae7c48ff0e094d" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" ADD CONSTRAINT "FK_8025194108df75d86b0ce89a7ae" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" ADD CONSTRAINT "FK_dffb98c7ea8dc3e6135b9eb80dc" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" ADD CONSTRAINT "FK_2101b922daa83647a0984fef644" FOREIGN KEY ("type_id") REFERENCES "construction_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" ADD CONSTRAINT "FK_c003ce1b2b8bb12c0a00ffc0176" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" ADD CONSTRAINT "FK_b35ab59372a3dfb27b84c04cc9b" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" ADD CONSTRAINT "FK_bb489287a1eef353c9b09290c42" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" ADD CONSTRAINT "FK_af5d8f4e1b0b8f85c65a31919d0" FOREIGN KEY ("funding_source_id") REFERENCES "funding_sources"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" ADD CONSTRAINT "FK_732716d5ac510627ebcdef6fc96" FOREIGN KEY ("primary_delay_reason_id") REFERENCES "delay_reasons"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_analyses" ADD CONSTRAINT "FK_c977fd742350c7fd323af5a011c" FOREIGN KEY ("object_id") REFERENCES "construction_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_transactions" ADD CONSTRAINT "FK_a74e4e18bef1bf3b2a1cac036ad" FOREIGN KEY ("object_id") REFERENCES "construction_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_transactions" ADD CONSTRAINT "FK_88adea7099bc8fc44565a22de4d" FOREIGN KEY ("allocation_id") REFERENCES "funding_allocations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_transactions" ADD CONSTRAINT "FK_81a7c17756f90ef220c3bc95ed8" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_allocations" ADD CONSTRAINT "FK_3802cc8b4fe418dea27b172f683" FOREIGN KEY ("object_id") REFERENCES "construction_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_allocations" ADD CONSTRAINT "FK_f1fa2ab98c407f32a056e59357f" FOREIGN KEY ("source_id") REFERENCES "funding_sources"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_38b93a8b6cd5a4fedf9834776d8" FOREIGN KEY ("object_id") REFERENCES "construction_objects"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_38b93a8b6cd5a4fedf9834776d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_allocations" DROP CONSTRAINT "FK_f1fa2ab98c407f32a056e59357f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_allocations" DROP CONSTRAINT "FK_3802cc8b4fe418dea27b172f683"`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_transactions" DROP CONSTRAINT "FK_81a7c17756f90ef220c3bc95ed8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_transactions" DROP CONSTRAINT "FK_88adea7099bc8fc44565a22de4d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "funding_transactions" DROP CONSTRAINT "FK_a74e4e18bef1bf3b2a1cac036ad"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_bd2726fd31b35443f2245b93ba0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ai_analyses" DROP CONSTRAINT "FK_c977fd742350c7fd323af5a011c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP CONSTRAINT "FK_732716d5ac510627ebcdef6fc96"`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP CONSTRAINT "FK_af5d8f4e1b0b8f85c65a31919d0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP CONSTRAINT "FK_bb489287a1eef353c9b09290c42"`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP CONSTRAINT "FK_b35ab59372a3dfb27b84c04cc9b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP CONSTRAINT "FK_c003ce1b2b8bb12c0a00ffc0176"`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP CONSTRAINT "FK_2101b922daa83647a0984fef644"`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP CONSTRAINT "FK_dffb98c7ea8dc3e6135b9eb80dc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "construction_objects" DROP CONSTRAINT "FK_8025194108df75d86b0ce89a7ae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_reports" DROP CONSTRAINT "FK_7bb81e744dbb5ae7c48ff0e094d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_reports" DROP CONSTRAINT "FK_f79129e7a2f89082aca2b71dd14"`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_reports" DROP CONSTRAINT "FK_91a599d3417c10b95320d65e08c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_report_images" DROP CONSTRAINT "FK_bfe916788f9f9d20ee15eae8be7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo_report_images" DROP CONSTRAINT "FK_c44bd6744efc5a778892c61e67c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_progress_updates" DROP CONSTRAINT "FK_e4b68ec51d49dc3bdb91cce09cc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_progress_updates" DROP CONSTRAINT "FK_2822d50cbe93f1e439fd740ec0d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_milestones" DROP CONSTRAINT "FK_c82c8ec2371f4e0675c9704def8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_documents" DROP CONSTRAINT "FK_e887eeecc6764aca69250e37f3d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_documents" DROP CONSTRAINT "FK_27e8d48788535a6e0d1d6e5bfe2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_documents" DROP CONSTRAINT "FK_fe9e3860b565ed004794fba6f0c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "files" DROP CONSTRAINT "FK_b25b4b9c85b6e6ffa2789dc5da5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_delays" DROP CONSTRAINT "FK_8a691fc7383ecfd23e84516c5e0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_delays" DROP CONSTRAINT "FK_091a4ef0e69d2f7e0bdc9cd968b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "object_delays" DROP CONSTRAINT "FK_311a158b245170bf8eefe24c9cb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_6bf4734eb05d2a3d74fa3186f37"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_efc03fc2a5902ef17fb8a2bdcc2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_1901e9aae03c8897b7dd460c27f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "districts" DROP CONSTRAINT "FK_4271e8e205bbdce31975c55ed3f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3ddc983c5f7bcf132fd8732c3f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_notifications_user_read"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9a8a82462cab47c73d25f49261"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP INDEX "public"."idx_allocations_year"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3802cc8b4fe418dea27b172f68"`,
    );
    await queryRunner.query(`DROP TABLE "funding_allocations"`);
    await queryRunner.query(`DROP INDEX "public"."idx_funding_tx_object_date"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_01432af76fdcb80e51500bfb66"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a74e4e18bef1bf3b2a1cac036a"`,
    );
    await queryRunner.query(`DROP TABLE "funding_transactions"`);
    await queryRunner.query(`DROP INDEX "public"."idx_audit_entity"`);
    await queryRunner.query(`DROP INDEX "public"."idx_audit_user_date"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ba86ef231f5dcbb7b099771cb0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_975c2db59c65c05fd9c6b63a2a"`,
    );
    await queryRunner.query(`DROP TABLE "app_settings"`);
    await queryRunner.query(`DROP INDEX "public"."idx_ai_object_type_date"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c977fd742350c7fd323af5a011"`,
    );
    await queryRunner.query(`DROP TABLE "ai_analyses"`);
    await queryRunner.query(`DROP INDEX "public"."idx_objects_region_health"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_objects_district_health"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_objects_type_health"`);
    await queryRunner.query(`DROP INDEX "public"."idx_objects_planned_end"`);
    await queryRunner.query(`DROP INDEX "public"."idx_objects_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8abfb947dcf75cdfa620867be9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_83f79f61456dc3809165c14a53"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bb489287a1eef353c9b09290c4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b35ab59372a3dfb27b84c04cc9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2101b922daa83647a0984fef64"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dffb98c7ea8dc3e6135b9eb80d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8025194108df75d86b0ce89a7a"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_23933f00b86a124c23e206b011"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_06be83d4325c05a3efc9496d3f"`,
    );
    await queryRunner.query(`DROP TABLE "construction_objects"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_photo_reports_object_date"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e9522c9fe01981bac1739a472b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_346fcf9e7b967968fe8e75ae46"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_91a599d3417c10b95320d65e08"`,
    );
    await queryRunner.query(`DROP TABLE "photo_reports"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_photo_images_report_order"`,
    );
    await queryRunner.query(`DROP TABLE "photo_report_images"`);
    await queryRunner.query(`DROP INDEX "public"."idx_progress_object_date"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2822d50cbe93f1e439fd740ec0"`,
    );
    await queryRunner.query(`DROP TABLE "object_progress_updates"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_milestones_object_order"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_milestones_planned_end"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9f650d2ef222bb23ba35134958"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c82c8ec2371f4e0675c9704def"`,
    );
    await queryRunner.query(`DROP TABLE "object_milestones"`);
    await queryRunner.query(`DROP INDEX "public"."idx_documents_object_type"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fe9e3860b565ed004794fba6f0"`,
    );
    await queryRunner.query(`DROP TABLE "object_documents"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b25b4b9c85b6e6ffa2789dc5da"`,
    );
    await queryRunner.query(`DROP TABLE "files"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_437dffe25174bbf50aff6b6172"`,
    );
    await queryRunner.query(`DROP TABLE "funding_sources"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b138fda2a2f2f7836a5198b163"`,
    );
    await queryRunner.query(`DROP TABLE "delay_reasons"`);
    await queryRunner.query(`DROP INDEX "public"."idx_delays_object_status"`);
    await queryRunner.query(`DROP INDEX "public"."idx_delays_reason_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2f345527fc2905089e17947035"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_311a158b245170bf8eefe24c9c"`,
    );
    await queryRunner.query(`DROP TABLE "object_delays"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ace513fa30d485cfd25c11a9e4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4271e8e205bbdce31975c55ed3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8e9d73424149b43b38244f7552"`,
    );
    await queryRunner.query(`DROP TABLE "districts"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_4f6dc5a464961e7c65a395ea4c"`,
    );
    await queryRunner.query(`DROP TABLE "regions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b942d55b92ededa770041db9de"`,
    );
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7c9dfb6c4b2710c8a2671dab59"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b3bdf613cab8dbfe479332b7ff"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_246e635c8a3c058e684f5f0b99"`,
    );
    await queryRunner.query(`DROP TABLE "contractors"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_887999e745306ea14046446d4d"`,
    );
    await queryRunner.query(`DROP TABLE "construction_types"`);
  }
}
