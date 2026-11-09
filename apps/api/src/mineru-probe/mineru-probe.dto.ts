import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateProbe {
  @IsUUID("4") requestKey!: string;
  @IsIn(["reading", "stack", "volume300"]) fixtureId!: string;
  @IsIn(["flash", "basic"]) tier!: "flash" | "basic";
  @IsInt() @Min(1) @Max(600) pollSeconds!: number;
}
export class ProbeRef {
  @IsUUID("4") snapshotId!: string;
  @IsInt() @Min(1) epoch!: number;
}
export class CheckpointProbe extends ProbeRef {
  @IsInt() @Min(1) revision!: number;
  @IsIn([
    "source_ready",
    "create_pending",
    "submitted",
    "poll_timeout",
    "create_unknown",
    "upstream_lost",
    "failed",
  ])
  phase!: string;
  @IsOptional() @Matches(/^file-[a-zA-Z0-9_-]{1,120}$/) fileId?: string;
  @IsOptional() @Matches(/^job_[a-zA-Z0-9_-]{1,120}$/) upstreamJobId?: string;
  @IsOptional()
  @IsIn([
    "CREATE_UNKNOWN",
    "UPSTREAM_LOST",
    "UPSTREAM_FAILED",
    "PROTOCOL_INVALID",
    "TRANSPORT_UNKNOWN",
    "ARTIFACT_MISMATCH",
  ])
  failureCode?: string;
}
export class ProbeArtifact {
  @IsIn(["markdown", "middle_json", "structured_content"]) format!: string;
  @Matches(/^file-[a-zA-Z0-9_-]{1,120}$/) fileId!: string;
  @IsInt() @Min(1) @Max(33554432) bytes!: number;
  @Matches(/^[0-9a-f]{64}$/) sha256!: string;
}
export class FinishProbe extends ProbeRef {
  @Matches(/^job_[a-zA-Z0-9_-]{1,120}$/) upstreamJobId!: string;
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ProbeArtifact)
  artifacts!: ProbeArtifact[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(300, { each: true })
  pageIndices!: number[];
  @IsString() @IsIn(["4.0.7"]) parserVersion!: string;
}
export class StopProbe {
  @IsUUID("4") snapshotId!: string;
  @IsInt() @Min(1) epoch!: number;
  @IsIn(["logical_acknowledged", "unknown"]) terminationState!: string;
}
