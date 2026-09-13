package com.aiko.onmyoji.data.remote

import com.aiko.onmyoji.data.model.ActOptions
import com.aiko.onmyoji.data.model.ActRequest
import com.aiko.onmyoji.data.model.ActResponse
import com.aiko.onmyoji.data.model.HealthResponse
import com.aiko.onmyoji.data.model.JourneyState
import com.aiko.onmyoji.data.model.StartRequest
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface OnmyojiApi {
    @GET("api/onmyoji/health")
    suspend fun health(): HealthResponse

    @POST("api/onmyoji/start")
    suspend fun start(@Body body: StartRequest = StartRequest()): JourneyState

    @GET("api/onmyoji/state")
    suspend fun state(): JourneyState

    @GET("api/onmyoji/options")
    suspend fun options(): ActOptions

    @POST("api/onmyoji/act")
    suspend fun act(@Body body: ActRequest): ActResponse
}
