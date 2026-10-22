{{/*
Expand the name of the chart.
*/}}
{{- define "booking-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "booking-app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "booking-app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to all resources
*/}}
{{- define "booking-app.labels" -}}
helm.sh/chart: {{ include "booking-app.chart" . }}
{{ include "booking-app.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels used for Pod matching
*/}}
{{- define "booking-app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "booking-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
PostgreSQL resource name
*/}}
{{- define "booking-app.postgresFullname" -}}
{{- printf "%s-postgres" (include "booking-app.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Redis resource name
*/}}
{{- define "booking-app.redisFullname" -}}
{{- printf "%s-redis" (include "booking-app.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
