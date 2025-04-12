#pragma once
#include <windows.h>
#include <tlhelp32.h>
#include <iostream>
#include "types.h"

// Function declaration
bool HollowProcess(const char* targetPath, const char* payloadPath); 