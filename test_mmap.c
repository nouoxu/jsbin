#include <sys/mman.h>
#include <stdio.h>
int main() {
    printf("MAP_PRIVATE: 0x%x\n", MAP_PRIVATE);
    printf("MAP_ANON: 0x%x\n", MAP_ANON);
    printf("MAP_ANON|MAP_PRIVATE: 0x%x\n", MAP_ANON|MAP_PRIVATE);
    return 0;
}
