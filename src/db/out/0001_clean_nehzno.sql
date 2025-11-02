DROP TABLE IF EXISTS "todos";
DROP TABLE IF EXISTS "projects";

CREATE TABLE "repositories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "repositories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"github_id" integer NOT NULL UNIQUE,
	"full_name" varchar(255) NOT NULL,
	"owner" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"default_branch" varchar(255),
	"private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);

CREATE TABLE "pull_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pull_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"github_id" integer NOT NULL UNIQUE,
	"number" integer NOT NULL,
	"title" varchar(500) NOT NULL,
	"body" text,
	"state" varchar(50) NOT NULL,
	"author" varchar(255) NOT NULL,
	"author_avatar" text,
	"base_branch" varchar(255) NOT NULL,
	"head_branch" varchar(255) NOT NULL,
	"mergeable" boolean,
	"merged" boolean DEFAULT false NOT NULL,
	"draft" boolean DEFAULT false NOT NOT,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"merged_at" timestamp with time zone,
	"repository_id" integer NOT NULL
);

CREATE TABLE "pr_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pr_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"filename" varchar(500) NOT NULL,
	"status" varchar(50) NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"changes" integer DEFAULT 0 NOT NULL,
	"patch" text,
	"previous_filename" varchar(500),
	"sha" varchar(255),
	"pull_request_id" integer NOT NULL
);

ALTER TABLE "repositories" ADD CONSTRAINT "repositories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pr_files" ADD CONSTRAINT "pr_files_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE cascade ON UPDATE no action;
