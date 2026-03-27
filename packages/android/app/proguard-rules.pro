# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.stream.app.**$$serializer { *; }
-keepclassmembers class com.stream.app.** { *** Companion; }
-keepclasseswithmembers class com.stream.app.** { kotlinx.serialization.KSerializer serializer(...); }
