#pragma once
#include <windows.h>

// Define missing types and functions
typedef NTSTATUS(NTAPI* NtUnmapViewOfSection_t)(HANDLE ProcessHandle, PVOID BaseAddress);
typedef struct _PROCESS_ENVIRONMENT_BLOCK_CUSTOM {
    BYTE Reserved1[2];
    BYTE BeingDebugged;
    BYTE Reserved2[1];
    PVOID Ldr;
    PVOID ProcessParameters;
    BYTE Reserved3[520];
    PVOID PostProcessInitRoutine;
    BYTE Reserved4[136];
    PVOID ImageBaseAddress;
} PROCESS_ENVIRONMENT_BLOCK_CUSTOM, *PPROCESS_ENVIRONMENT_BLOCK_CUSTOM; 